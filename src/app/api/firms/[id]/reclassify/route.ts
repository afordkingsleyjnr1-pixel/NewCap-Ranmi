import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { classifyFirm, applyClassification } from "@/lib/services/classification-engine";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "edit_firms");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const entity = await prisma.entity.findUniqueOrThrow({ where: { id } });

  const result = await classifyFirm({
    firmName: entity.name,
    domain: entity.domain,
    strategyDetail: entity.strategyDetail,
  });
  await applyClassification(id, result, { isReclassify: true });

  const updated = await prisma.entity.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ entity: updated, droppedTags: result.droppedTags });
}
