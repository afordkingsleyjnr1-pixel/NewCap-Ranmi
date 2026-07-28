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

  const firms = await prisma.firm.findMany({ where: { deletedAt: null } });
  let changed = 0;

  for (const firm of firms) {
    const before = JSON.stringify({ s: firm.strategies, f: firm.focusAreas });
    const result = await classifyFirm({ firmName: firm.name, domain: firm.domain, strategyDetail: firm.strategyDetail });
    await applyClassification(firm.id, result, { isReclassify: true });
    const after = await prisma.firm.findUniqueOrThrow({ where: { id: firm.id } });
    if (JSON.stringify({ s: after.strategies, f: after.focusAreas }) !== before) changed++;
  }

  return NextResponse.json({ totalFirms: firms.length, changed });
}
