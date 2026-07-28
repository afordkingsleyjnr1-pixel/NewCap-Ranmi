import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { createCalendarEvent } from "@/lib/services/calendar";
import { completePendingTask } from "@/lib/services/pipeline-tasks";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  // Section 5.8 step 8 — Upcoming Meetings: every future meeting across all entities, chronological.
  const meetings = await prisma.meeting.findMany({
    where: { status: "scheduled", startTime: { gte: new Date() } },
    include: { entity: true, contact: true },
    orderBy: { startTime: "asc" },
  });
  return NextResponse.json({ meetings });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_meetings");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const { entityId, contactId, adHocName, adHocEmail, title, startTime, endTime, locationOrLink, agendaNotes } = body;

  const stage = await prisma.entityStage.findUniqueOrThrow({ where: { entityId } });
  if (stage.stage === "do_not_contact") {
    return NextResponse.json({ error: "This entity is marked Do Not Contact. Scheduling is blocked." }, { status: 403 });
  }

  const connection = await prisma.emailConnection.findUnique({ where: { userId: user!.id } });
  if (!connection || connection.status !== "connected") {
    return NextResponse.json({ error: "NEEDS_REAUTH", message: "Reconnect your email to continue." }, { status: 409 });
  }

  const attendeeEmail = contactId ? (await prisma.contact.findUniqueOrThrow({ where: { id: contactId } })).email : adHocEmail;
  if (!attendeeEmail) return NextResponse.json({ error: "No attendee email available" }, { status: 400 });

  const entity = await prisma.entity.findUniqueOrThrow({ where: { id: entityId } });

  try {
    const event = await createCalendarEvent({
      userId: user!.id,
      title,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      attendeeEmail,
      locationOrLink,
      agendaNotes,
    });

    const meeting = await prisma.meeting.create({
      data: {
        entityId,
        contactId: contactId ?? null,
        adHocRecipientName: contactId ? null : adHocName,
        adHocRecipientEmail: contactId ? null : adHocEmail,
        title,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        locationOrLink,
        agendaNotes,
        providerEventId: event.providerEventId,
        status: "scheduled",
      },
    });

    await prisma.activityLog.create({ data: { entityId, contactId, type: "meeting", body: `Meeting scheduled: "${title}"`, createdById: user!.id } });
    await prisma.entityStage.update({ where: { entityId }, data: { stage: "meeting_scheduled", stageChangedAt: new Date() } });
    await prisma.activityLog.create({ data: { entityId, type: "stage_change", body: "Stage changed to meeting_scheduled", createdById: user!.id } });
    await completePendingTask(entityId, entity.name, "schedule_meeting");

    return NextResponse.json({ meeting });
  } catch (e) {
    if (e instanceof Error && e.message === "NEEDS_REAUTH") {
      return NextResponse.json({ error: "NEEDS_REAUTH", message: "Reconnect your email to continue." }, { status: 409 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Scheduling failed" }, { status: 500 });
  }
}
