import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { firmScopeWhere } from "@/lib/authz";

// Section 5.11 — pipeline conversion funnel, outreach-to-response rate, closed-won list.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const scope = await firmScopeWhere(user);

  const entities = await prisma.entity.findMany({ where: { deletedAt: null, ...scope }, include: { stage: true } });
  const funnel: Record<string, number> = {};
  for (const f of entities) {
    const stage = f.stage?.stage ?? "not_contacted";
    funnel[stage] = (funnel[stage] ?? 0) + 1;
  }

  const threads = await prisma.emailThread.findMany({ where: { entity: { deletedAt: null, ...scope } } });
  const sent = threads.length;
  const replied = threads.filter((t: any) => t.status === "replied").length;
  const responseRate = sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0;

  const closedWon = await prisma.entityStage.findMany({
    where: { stage: "closed_won", entity: { deletedAt: null, ...scope } },
    include: { entity: true },
  });

  return NextResponse.json({ funnel, outreach: { sent, replied, responseRate }, closedWon });
}
