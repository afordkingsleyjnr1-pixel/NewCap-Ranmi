import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_tasks");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const body = await req.json();
  const before = await prisma.task.findUniqueOrThrow({ where: { id } });
  const data: Record<string, unknown> = {};
  if ("title" in body) data.title = body.title;
  if ("dueDate" in body) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if ("status" in body) {
    data.status = body.status;
    data.completedAt = body.status === "done" ? new Date() : null;
  }

  const systemNotes: string[] = [];

  if ("trackerStatus" in body) {
    data.trackerStatus = body.trackerStatus;
    if (body.trackerStatus !== before.trackerStatus) systemNotes.push(`Status changed to "${body.trackerStatus.replace(/_/g, " ")}"`);
    // The tracker is the user-facing progress state — completing or
    // reopening it here also keeps the system status/completedAt (used by
    // the CRM pending-action automation) in sync, so the two never drift.
    if (body.trackerStatus === "completed") {
      data.status = "done";
      data.completedAt = new Date();
      data.progressPercent = 100;
    } else if (before.trackerStatus === "completed") {
      data.status = "open";
      data.completedAt = null;
    }
  }
  if ("progressPercent" in body) {
    const pct = Math.max(0, Math.min(100, Math.round(Number(body.progressPercent))));
    data.progressPercent = pct;
    if (pct !== before.progressPercent) systemNotes.push(`Progress updated to ${pct}%`);
  }
  if ("timeSpentMinutes" in body) {
    const added = Math.max(0, Math.round(Number(body.timeSpentMinutes)));
    if (added > 0) {
      data.timeSpentMinutes = before.timeSpentMinutes + added;
      systemNotes.push(`Logged ${added} minute${added === 1 ? "" : "s"} (total ${before.timeSpentMinutes + added} min)`);
    }
  }
  if (body.action === "verify_completion") {
    data.completionVerifiedById = user!.id;
    data.completionVerifiedAt = new Date();
    systemNotes.push(`Completion verified by ${user!.name}`);
  }

  const task = await prisma.task.update({ where: { id }, data });

  if (body.status === "done") {
    await prisma.activityLog.create({ data: { firmId: task.firmId, type: "note", body: `Task completed: "${task.title}"`, createdById: user!.id, deletable: false } });
  }
  for (const note of systemNotes) {
    await prisma.taskComment.create({ data: { taskId: id, body: note, isSystem: true, createdById: user!.id } });
  }

  return NextResponse.json({ task });
}

// Section 5.9 step 3 — deleting a task is a genuine hard delete, template or ad hoc.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_tasks");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
