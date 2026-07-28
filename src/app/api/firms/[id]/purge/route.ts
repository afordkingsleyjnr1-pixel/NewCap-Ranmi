import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";

// Settings → Recently Deleted → Delete Permanently. This is a genuine hard
// delete — only reachable from a entity that's already soft-deleted — freeing
// the name/domain from dedupe checks so the entity can be added again as a
// fresh record later. Everything hanging off entity_id is removed with it;
// unlike the soft-delete path, this is deliberately not reversible.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id: entityId } = await params;

  const entity = await prisma.entity.findUniqueOrThrow({ where: { id: entityId } });
  if (!entity.deletedAt) {
    return NextResponse.json({ error: "Only a soft-deleted entity can be purged permanently." }, { status: 400 });
  }

  const contactIds = (await prisma.contact.findMany({ where: { entityId }, select: { id: true } })).map((c: { id: string }) => c.id);

  await prisma.$transaction([
    prisma.researchSource.deleteMany({
      where: { OR: [{ entityType: "entity", entityId: entityId }, { entityType: "contact", entityId: { in: contactIds } }] },
    }),
    prisma.emailMessage.deleteMany({ where: { thread: { entityId } } }),
    prisma.emailThread.deleteMany({ where: { entityId } }),
    prisma.meeting.deleteMany({ where: { entityId } }),
    prisma.task.deleteMany({ where: { entityId } }),
    prisma.activityLog.deleteMany({ where: { entityId } }),
    prisma.contact.deleteMany({ where: { entityId } }),
    prisma.entityStage.deleteMany({ where: { entityId } }),
    prisma.entity.delete({ where: { id: entityId } }),
  ]);

  return NextResponse.json({ ok: true });
}
