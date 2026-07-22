import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";

// Settings → Recently Deleted → Delete Permanently. This is a genuine hard
// delete — only reachable from a firm that's already soft-deleted — freeing
// the name/domain from dedupe checks so the firm can be added again as a
// fresh record later. Everything hanging off firm_id is removed with it;
// unlike the soft-delete path, this is deliberately not reversible.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id: firmId } = await params;

  const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId } });
  if (!firm.deletedAt) {
    return NextResponse.json({ error: "Only a soft-deleted firm can be purged permanently." }, { status: 400 });
  }

  const contactIds = (await prisma.contact.findMany({ where: { firmId }, select: { id: true } })).map((c) => c.id);

  await prisma.$transaction([
    prisma.researchSource.deleteMany({
      where: { OR: [{ entityType: "firm", entityId: firmId }, { entityType: "contact", entityId: { in: contactIds } }] },
    }),
    prisma.emailMessage.deleteMany({ where: { thread: { firmId } } }),
    prisma.emailThread.deleteMany({ where: { firmId } }),
    prisma.meeting.deleteMany({ where: { firmId } }),
    prisma.task.deleteMany({ where: { firmId } }),
    prisma.activityLog.deleteMany({ where: { firmId } }),
    prisma.contact.deleteMany({ where: { firmId } }),
    prisma.crmStageRow.deleteMany({ where: { firmId } }),
    prisma.firm.delete({ where: { id: firmId } }),
  ]);

  return NextResponse.json({ ok: true });
}
