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

  const [totalManagers, followUpsPending, activeDeals, closedWon] = await Promise.all([
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

  return NextResponse.json({ totalManagers, followUpsPending, activeDeals, closedWon });
}
