import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; entityId: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_tasks");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id: projectId, entityId } = await params;
  await prisma.projectFirm.deleteMany({ where: { projectId, entityId } });
  return NextResponse.json({ ok: true });
}
