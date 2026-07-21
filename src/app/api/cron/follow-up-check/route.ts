import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAppSettings } from "@/lib/services/app-settings";

// Section 5.6/5.7 step 9 — daily job: Outreach Sent -> Follow-Up Due (after threshold,
// no reply) and, once a follow-up was actually sent and the threshold passes again,
// Follow-Up Due -> No Response. Intended to run once/day via an external scheduler
// (e.g. Vercel Cron hitting this route) — see vercel.json.
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getAppSettings();
  const thresholdMs = settings.followUpThresholdDays * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - thresholdMs);

  let movedToFollowUp = 0;
  let movedToNoResponse = 0;

  const outreachSentThreads = await prisma.emailThread.findMany({
    where: { status: "awaiting_reply", followUpSentAt: null, lastActivityAt: { lte: cutoff } },
    include: { firm: { include: { crmStage: true } } },
  });
  for (const t of outreachSentThreads) {
    if (t.firm.crmStage?.stage === "outreach_sent") {
      await prisma.crmStageRow.update({ where: { firmId: t.firmId }, data: { stage: "follow_up_due", stageChangedAt: new Date() } });
      await prisma.activityLog.create({ data: { firmId: t.firmId, type: "stage_change", body: "Auto-flagged: Follow-Up Due (no reply within threshold)" } });
      movedToFollowUp++;
    }
  }

  const followedUpThreads = await prisma.emailThread.findMany({
    where: { status: "awaiting_reply", followUpSentAt: { lte: cutoff } },
    include: { firm: { include: { crmStage: true } } },
  });
  for (const t of followedUpThreads) {
    if (t.firm.crmStage?.stage === "follow_up_due") {
      await prisma.$transaction([
        prisma.emailThread.update({ where: { id: t.id }, data: { status: "no_response" } }),
        prisma.crmStageRow.update({ where: { firmId: t.firmId }, data: { stage: "no_response", stageChangedAt: new Date() } }),
        prisma.activityLog.create({ data: { firmId: t.firmId, type: "stage_change", body: "Auto-flagged: No Response (follow-up threshold passed)" } }),
      ]);
      movedToNoResponse++;
    }
  }

  return NextResponse.json({ movedToFollowUp, movedToNoResponse });
}
