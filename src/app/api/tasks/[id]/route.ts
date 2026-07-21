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
  const data: Record<string, unknown> = {};
  if ("title" in body) data.title = body.title;
  if ("dueDate" in body) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if ("status" in body) {
    data.status = body.status;
    data.completedAt = body.status === "done" ? new Date() : null;
  }
  const task = await prisma.task.update({ where: { id }, data });

  if (body.status === "done") {
    await prisma.activityLog.create({ data: { firmId: task.firmId, type: "note", body: `Task completed: "${task.title}"`, createdById: user!.id, deletable: false } });
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
