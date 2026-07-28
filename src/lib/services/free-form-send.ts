import { prisma } from "@/lib/db";
import { sendOutreachEmail, type OutboundAttachment } from "./email-send";
import { attachmentsForStorage } from "./attachment-store";

/**
 * Messages section — free-form send, shared by the compose modal, the
 * in-thread Reply composer, and sending a saved Draft. Deliberately bypasses
 * the CRM outreach pipeline (/api/outreach/send): no Do Not Contact gate, no
 * forced stage change, no pending-task completion. A firm/contact link is
 * optional and, if present, is for record-keeping only (shows on that
 * firm's Activity tab).
 *
 * Pass `replyToThreadId` to send within an existing thread (Reply/Reply-All
 * style send from the Messages UI) instead of starting a new one — reuses
 * the thread's provider_thread_id so it lands as an actual reply in
 * Gmail/Outlook, same as CRM follow-ups do.
 */
export async function sendFreeFormMessage(params: {
  userId: string;
  firmId?: string | null;
  contactId?: string | null;
  toName?: string;
  toEmail?: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  message: string;
  replyToThreadId?: string;
  attachments?: OutboundAttachment[];
}): Promise<{ threadId: string }> {
  const connection = await prisma.emailConnection.findUnique({ where: { userId: params.userId } });
  if (!connection || connection.status !== "connected") {
    throw new Error("NEEDS_REAUTH");
  }

  const existingThread = params.replyToThreadId ? await prisma.emailThread.findUnique({ where: { id: params.replyToThreadId } }) : null;

  const recipientEmail = existingThread
    ? (existingThread.adHocRecipientEmail ??
        (existingThread.contactId ? (await prisma.contact.findUnique({ where: { id: existingThread.contactId } }))?.email : null))
    : params.contactId
      ? (await prisma.contact.findUniqueOrThrow({ where: { id: params.contactId } })).email
      : params.toEmail;
  if (!recipientEmail) throw new Error("No recipient email address given");
  if (!params.subject?.trim() || !params.message?.trim()) throw new Error("Subject and message are required");

  const sendResult = await sendOutreachEmail({
    userId: params.userId,
    to: recipientEmail,
    cc: params.cc,
    bcc: params.bcc,
    subject: params.subject,
    body: params.message,
    attachments: params.attachments,
    existingProviderThreadId: existingThread?.providerThreadId,
  });

  const thread =
    existingThread ??
    (await prisma.emailThread.create({
      data: {
        firmId: params.firmId || null,
        contactId: params.contactId || null,
        adHocRecipientName: params.contactId ? null : params.toName || null,
        adHocRecipientEmail: params.contactId ? null : recipientEmail,
        subject: params.subject,
        providerThreadId: sendResult.providerThreadId,
        status: "awaiting_reply",
        isFreeForm: true,
      },
    }));

  if (existingThread) {
    await prisma.emailThread.update({ where: { id: thread.id }, data: { lastActivityAt: new Date(), status: "awaiting_reply" } });
  }

  await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: "outbound",
      body: params.message,
      isFollowUp: false,
      providerMessageId: sendResult.providerMessageId ?? null,
      ccEmails: params.cc ?? [],
      bccEmails: params.bcc ?? [],
      attachments: attachmentsForStorage(params.attachments),
    },
  });

  if (thread.firmId) {
    await prisma.activityLog.create({
      data: { firmId: thread.firmId, contactId: thread.contactId, type: "email_sent", body: `Message sent: "${params.subject}"`, createdById: params.userId },
    });
  }

  return { threadId: thread.id };
}
