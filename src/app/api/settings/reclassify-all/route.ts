import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { classifyFirm, applyClassification } from "@/lib/services/classification-engine";

export async function POST() {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const entities = await prisma.entity.findMany({ where: { deletedAt: null } });
  let changed = 0;

  for (const entity of entities) {
    const before = JSON.stringify({ s: entity.strategies, f: entity.focusAreas });
    const result = await classifyFirm({ firmName: entity.name, domain: entity.domain, strategyDetail: entity.strategyDetail });
    await applyClassification(entity.id, result, { isReclassify: true });
    const after = await prisma.entity.findUniqueOrThrow({ where: { id: entity.id } });
    if (JSON.stringify({ s: after.strategies, f: after.focusAreas }) !== before) changed++;
  }

  return NextResponse.json({ totalFirms: entities.length, changed });
}
