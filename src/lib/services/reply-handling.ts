import { prisma } from "@/lib/db";
import { createNotification } from "./notifications";

/**
 * Section: "Email Sent" / "Follow-Up Sent" — if the firm replies before the
 * follow-up date, automatically move it to "Responded". Shared by both the
 * Gmail and Outlook reply webhooks so the stage-transition logic lives in
 * one place.
 */
export async function handleInboundReply(params: {
  threadId: string;
  body: string;
  notifyUserId: string;
  providerMessageId?: string;
  sentAt?: Date;
  ccEmails?: string[];
  attachments?: Array<{ filename: string; mimeType: string; contentBase64?: string }>;
}) {
  const thread = await prisma.emailThread.findUniqueOrThrow({ where: { id: params.threadId } });

  await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: "inbound",
      body: params.body,
      isFollowUp: false,
      providerMessageId: params.providerMessageId ?? null,
      ccEmails: params.ccEmails ?? [],
      attachments: params.attachments?.length ? params.attachments : undefined,
      sentAt: params.sentAt ?? new Date(),
    },
  });
  await prisma.emailThread.update({ where: { id: thread.id }, data: { status: "replied", lastActivityAt: new Date(), hasUnreadReply: true } });

  if (thread.firmId) {
    await prisma.activityLog.create({
      data: { firmId: thread.firmId, contactId: thread.contactId, type: "email_received", body: "Reply received", createdById: null },
    });

    // Free-form messages (Messages section) aren't part of the CRM stage machine — only
    // CRM-driven threads auto-advance to "Responded".
    if (!thread.isFreeForm) {
      const crmStage = await prisma.crmStageRow.findUnique({ where: { firmId: thread.firmId } });
      if (crmStage && crmStage.stage !== "do_not_contact" && crmStage.stage !== "responded") {
        await prisma.crmStageRow.update({ where: { firmId: thread.firmId }, data: { stage: "responded", stageChangedAt: new Date() } });
        await prisma.activityLog.create({
          data: { firmId: thread.firmId, type: "stage_change", body: "Reply received — stage automatically changed to Responded", createdById: null },
        });
      }
    }
  }

  await createNotification({
    userId: params.notifyUserId,
    type: "reply_received",
    relatedFirmId: thread.firmId ?? null,
    body: `New reply on "${thread.subject}"`,
  });
}

/**
 * A genuinely new inbound email from a known contact that isn't a reply to
 * any thread the platform already tracks — e.g. the contact emailed the
 * user's connected mailbox directly from their own inbox rather than
 * replying to something sent from the platform. Creates the thread the
 * message belongs in, then goes through the same notification path as an
 * ordinary reply.
 */
export async function ingestNewInboundThread(params: {
  subject: string;
  body: string;
  fromEmail: string;
  fromName: string | null;
  contactId: string | null;
  firmId: string | null;
  notifyUserId: string;
  providerThreadId: string;
  providerMessageId: string;
  sentAt?: Date;
  ccEmails?: string[];
  attachments?: Array<{ filename: string; mimeType: string; contentBase64?: string }>;
}): Promise<string> {
  const thread = await prisma.emailThread.create({
    data: {
      firmId: params.firmId,
      contactId: params.contactId,
      adHocRecipientName: params.contactId ? null : params.fromName,
      adHocRecipientEmail: params.contactId ? null : params.fromEmail,
      subject: params.subject,
      providerThreadId: params.providerThreadId,
      status: "replied",
      isFreeForm: true,
      hasUnreadReply: true,
      lastActivityAt: params.sentAt ?? new Date(),
    },
  });

  await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: "inbound",
      body: params.body,
      isFollowUp: false,
      providerMessageId: params.providerMessageId,
      ccEmails: params.ccEmails ?? [],
      attachments: params.attachments?.length ? params.attachments : undefined,
      sentAt: params.sentAt ?? new Date(),
    },
  });

  if (params.firmId) {
    await prisma.activityLog.create({
      data: { firmId: params.firmId, contactId: params.contactId, type: "email_received", body: "New email received", createdById: null },
    });
  }

  await createNotification({
    userId: params.notifyUserId,
    type: "reply_received",
    relatedFirmId: params.firmId,
    body: `New email from ${params.fromName ?? params.fromEmail}: "${params.subject}"`,
  });

  return thread.id;
}
