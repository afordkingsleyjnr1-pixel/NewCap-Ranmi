import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { firmScopeWhere } from "@/lib/authz";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const scope = await firmScopeWhere(user);

  const firms = await prisma.firm.findMany({
    where: { deletedAt: null, ...scope },
    include: { crmStage: true },
  });

  const funnel: Record<string, number> = {};
  for (const f of firms) {
    const stage = f.crmStage?.stage ?? "not_contacted";
    funnel[stage] = (funnel[stage] ?? 0) + 1;
  }

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const followUpsDue = await prisma.crmStageRow.findMany({
    where: { firm: { deletedAt: null, ...scope }, nextFollowUpDate: { lte: weekFromNow } },
    include: { firm: true },
    orderBy: { nextFollowUpDate: "asc" },
  });

  const awaitingTriage = await prisma.emailThread.findMany({
    where: { status: "replied", firm: { deletedAt: null, ...scope } },
    include: { firm: true },
    orderBy: { lastActivityAt: "desc" },
    take: 10,
  });

  const upcomingMeetings = await prisma.meeting.findMany({
    where: { status: "scheduled", startTime: { gte: now, lte: weekFromNow }, firm: { deletedAt: null, ...scope } },
    include: { firm: true, contact: true },
    orderBy: { startTime: "asc" },
  });

  const recentlyClosedWon = await prisma.crmStageRow.findMany({
    where: { stage: "closed_won", firm: { deletedAt: null, ...scope } },
    include: { firm: true },
    orderBy: { stageChangedAt: "desc" },
    take: 10,
  });

  const recentActivity = await prisma.activityLog.findMany({
    where: { firm: { deletedAt: null, ...scope } },
    include: { firm: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ funnel, followUpsDue, awaitingTriage, upcomingMeetings, recentlyClosedWon, recentActivity });
}
