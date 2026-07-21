import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { createNotification } from "@/lib/services/notifications";

// Section 5.13 step 7 — editing a role applies immediately to everyone assigned to it.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_team");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = body.name;
  if ("permissions" in body) data.permissions = body.permissions;
  if ("dataScope" in body) data.dataScope = body.dataScope;

  const role = await prisma.role.update({ where: { id }, data });

  const affectedUsers = await prisma.user.findMany({ where: { roleId: id } });
  for (const u of affectedUsers) {
    await createNotification({ userId: u.id, type: "role_changed", body: `Your role "${role.name}" permissions or scope changed.` });
  }

  return NextResponse.json({ role });
}

// Section 5.13 step 6a — deleting a role requires reassigning everyone on it first.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_team");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const role = await prisma.role.findUniqueOrThrow({ where: { id } });
  if (role.isSystemDefault) return NextResponse.json({ error: "System default roles can't be deleted." }, { status: 400 });

  const assignedCount = await prisma.user.count({ where: { roleId: id } });
  if (assignedCount > 0) {
    return NextResponse.json({ error: `${assignedCount} user(s) are assigned to this role. Reassign them before deleting.` }, { status: 400 });
  }

  await prisma.role.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
