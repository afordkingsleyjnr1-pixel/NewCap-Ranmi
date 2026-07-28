import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { updateCalendarEvent } from "@/lib/services/calendar";
import { createPendingTask } from "@/lib/services/pipeline-tasks";

// Section 4.8/6 — meetings are never user-deletable (use Cancel, not Delete); reschedule
// or cancel updates the same calendar event rather than creating a duplicate.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_meetings");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const body = await req.json();
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id } });

  if (body.action === "cancel") {
    if (meeting.providerEventId) {
      await updateCalendarEvent({ userId: user!.id, providerEventId: meeting.providerEventId, status: "canceled" });
    }
    const updated = await prisma.meeting.update({ where: { id }, data: { status: "canceled" } });
    await prisma.activityLog.create({ data: { firmId: meeting.firmId, type: "note", body: `Meeting canceled: "${meeting.title}"`, createdById: user!.id, deletable: false } });
    return NextResponse.json({ meeting: updated });
  }

  if (body.action === "reschedule") {
    const startTime = new Date(body.startTime);
    const endTime = new Date(body.endTime);
    if (meeting.providerEventId) {
      await updateCalendarEvent({ userId: user!.id, providerEventId: meeting.providerEventId, startTime, endTime });
    }
    const updated = await prisma.meeting.update({ where: { id }, data: { startTime, endTime } });
    await prisma.activityLog.create({ data: { firmId: meeting.firmId, type: "note", body: `Meeting rescheduled: "${meeting.title}"`, createdById: user!.id, deletable: false } });
    return NextResponse.json({ meeting: updated });
  }

  if (body.action === "log_notes") {
    await prisma.meeting.update({ where: { id }, data: { status: "completed", notesLoggedAt: new Date() } });
    await prisma.activityLog.create({ data: { firmId: meeting.firmId, type: "meeting", body: body.notes ?? "Meeting notes logged", createdById: user!.id } });
    return NextResponse.json({ ok: true });
  }

  // Post-meeting outcome prompt (Section 5 — Meeting Scheduled): once the
  // meeting's end time has passed, the user picks one of three outcomes.
  if (body.action === "set_outcome") {
    const outcome = body.outcome as "in_discussion" | "declined";
    const firm = await prisma.firm.findUniqueOrThrow({ where: { id: meeting.firmId } });

    await prisma.meeting.update({ where: { id }, data: { status: "completed", notesLoggedAt: new Date() } });

    if (outcome === "in_discussion") {
      await prisma.crmStageRow.update({ where: { firmId: meeting.firmId }, data: { stage: "in_discussion_diligence", stageChangedAt: new Date() } });
      await prisma.activityLog.create({
        data: { firmId: meeting.firmId, type: "stage_change", body: "Meeting outcome: In Discussion / Due Diligence", createdById: user!.id },
      });
      await createPendingTask(meeting.firmId, firm.name, "send_term_sheet");
    } else {
      await prisma.crmStageRow.update({ where: { firmId: meeting.firmId }, data: { stage: "nurture", stageChangedAt: new Date() } });
      await prisma.activityLog.create({
        data: { firmId: meeting.firmId, type: "stage_change", body: "Meeting outcome: Declined — moved to Nurture", createdById: user!.id },
      });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
