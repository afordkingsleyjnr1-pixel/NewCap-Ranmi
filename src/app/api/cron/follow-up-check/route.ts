import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAppSettings } from "@/lib/services/app-settings";
import { createPendingTask } from "@/lib/services/pipeline-tasks";
import { createNotification } from "@/lib/services/notifications";

// Daily job: Email Sent -> Follow-Up Due (no reply within threshold), and
// Follow-Up Sent -> No Response (follow-up itself got no reply either).
// Entering Follow-Up Due creates the "Send Follow-Up" task and a
// notification — the two required side effects of that transition.
// Intended to run once/day via an external scheduler (e.g. Vercel Cron
// hitting this route) — see vercel.json.
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

  const emailSentThreads = await prisma.emailThread.findMany({
    where: { status: "awaiting_reply", followUpSentAt: null, lastActivityAt: { lte: cutoff }, isFreeForm: false, firmId: { not: null } },
    include: { firm: { include: { crmStage: true } } },
  });
  for (const t of emailSentThreads) {
    const firmId = t.firmId;
    if (!t.firm || !firmId) continue;
    if (t.firm.crmStage?.stage === "email_sent") {
      await prisma.crmStageRow.update({ where: { firmId } , data: { stage: "follow_up_due", stageChangedAt: new Date() } });
      await prisma.activityLog.create({ data: { firmId, type: "stage_change", body: "Auto-flagged: Follow-Up Due (no reply within threshold)" } });
      await createPendingTask(firmId, t.firm.name, "send_follow_up");
      const owner = t.firm.crmStage?.ownerId;
      if (owner) {
        await createNotification({
          userId: owner,
          type: "follow_up_due",
          relatedFirmId: firmId,
          body: `Follow-up is due for ${t.firm.name}`,
        });
      }
      movedToFollowUp++;
    }
  }

  const followedUpThreads = await prisma.emailThread.findMany({
    where: { status: "awaiting_reply", followUpSentAt: { lte: cutoff }, isFreeForm: false, firmId: { not: null } },
    include: { firm: { include: { crmStage: true } } },
  });
  for (const t of followedUpThreads) {
    const firmId = t.firmId;
    if (!t.firm || !firmId) continue;
    if (t.firm.crmStage?.stage === "follow_up_sent") {
      await prisma.$transaction([
        prisma.emailThread.update({ where: { id: t.id }, data: { status: "no_response" } }),
        prisma.crmStageRow.update({ where: { firmId } , data: { stage: "no_response", stageChangedAt: new Date() } }),
        prisma.activityLog.create({ data: { firmId, type: "stage_change", body: "Auto-flagged: No Response (follow-up threshold passed)" } }),
      ]);
      movedToNoResponse++;
    }
  }

  return NextResponse.json({ movedToFollowUp, movedToNoResponse });
}
