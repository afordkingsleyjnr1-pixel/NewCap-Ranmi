import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { firmScopeWhere } from "@/lib/authz";

// Active-deal stages: past initial outreach, not yet closed/dead/nurtured.
const ACTIVE_DEAL_STAGES = ["responded_interested", "meeting_scheduled", "in_discussion_diligence", "term_sheet_loi"] as const;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const scope = await firmScopeWhere(user);

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [totalManagers, followUpsPending, activeDeals, closedWonCount] = await Promise.all([
    prisma.firm.count({ where: { deletedAt: null, ...scope } }),
    prisma.crmStageRow.count({
      where: {
        firm: { deletedAt: null, ...scope },
        OR: [{ stage: "follow_up_due" }, { nextFollowUpDate: { lte: weekFromNow } }],
      },
    }),
    prisma.crmStageRow.count({ where: { firm: { deletedAt: null, ...scope }, stage: { in: [...ACTIVE_DEAL_STAGES] } } }),
    prisma.crmStageRow.count({ where: { firm: { deletedAt: null, ...scope }, stage: "closed_won" } }),
  ]);

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

  return NextResponse.json({
    stats: { totalManagers, followUpsPending, activeDeals, closedWon: closedWonCount },
    followUpsDue,
    awaitingTriage,
    upcomingMeetings,
    recentlyClosedWon,
    recentActivity,
  });
}
