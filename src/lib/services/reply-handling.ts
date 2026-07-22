import { prisma } from "@/lib/db";
import { createNotification } from "./notifications";

/**
 * Section: "Email Sent" / "Follow-Up Sent" — if the firm replies before the
 * follow-up date, automatically move it to "Responded". Shared by both the
 * Gmail and Outlook reply webhooks so the stage-transition logic lives in
 * one place.
 */
export async function handleInboundReply(params: { threadId: string; body: string; notifyUserId: string }) {
  const thread = await prisma.emailThread.findUniqueOrThrow({ where: { id: params.threadId } });

  await prisma.emailMessage.create({
    data: { threadId: thread.id, direction: "inbound", body: params.body, isFollowUp: false },
  });
  await prisma.emailThread.update({ where: { id: thread.id }, data: { status: "replied", lastActivityAt: new Date() } });
  await prisma.activityLog.create({
    data: { firmId: thread.firmId, contactId: thread.contactId, type: "email_received", body: "Reply received", createdById: null },
  });

  const crmStage = await prisma.crmStageRow.findUnique({ where: { firmId: thread.firmId } });
  if (crmStage && crmStage.stage !== "do_not_contact" && crmStage.stage !== "responded") {
    await prisma.crmStageRow.update({ where: { firmId: thread.firmId }, data: { stage: "responded", stageChangedAt: new Date() } });
    await prisma.activityLog.create({
      data: { firmId: thread.firmId, type: "stage_change", body: "Reply received — stage automatically changed to Responded", createdById: null },
    });
  }

  await createNotification({
    userId: params.notifyUserId,
    type: "reply_received",
    relatedFirmId: thread.firmId,
    body: `New reply on "${thread.subject}"`,
  });
}
