import { prisma } from "@/lib/db";
import { sendOutreachEmail, type OutboundAttachment } from "./email-send";
import { attachmentsForStorage } from "./attachment-store";
import { completePendingTask } from "./pipeline-tasks";
import type { CrmStage } from "@/generated/prisma";

export class OutreachError extends Error {
  constructor(
    message: string,
    public code: "NEEDS_REAUTH" | "DO_NOT_CONTACT" | "NO_RECIPIENT" | "SEND_FAILED" = "SEND_FAILED"
  ) {
    super(message);
    this.name = "OutreachError";
  }
}

/**
 * Section 5.7 — Send Email / Send Follow-Up / Send Term Sheet: one shared
 * compose-and-track pipeline, distinguished by `kind`. Extracted from
 * /api/outreach/send so the Projects module's bulk-send endpoint can drive
 * the exact same CRM stage transitions per firm instead of re-implementing
 * them — sending from a project is never a separate workflow from sending
 * anywhere else in the platform.
 */
export async function sendOutreachToFirm(params: {
  userId: string;
  firmId: string;
  contactId?: string;
  adHocName?: string;
  adHocEmail?: string;
  subject: string;
  message: string;
  attachments?: OutboundAttachment[];
  kind: "email" | "follow_up" | "term_sheet";
}): Promise<{ threadId: string }> {
  const firm = await prisma.firm.findUniqueOrThrow({ where: { id: params.firmId } });
  const crmStage = await prisma.crmStageRow.findUniqueOrThrow({ where: { firmId: params.firmId } });
  if (crmStage.stage === "do_not_contact") {
    throw new OutreachError("This firm is marked Do Not Contact. Outreach is blocked.", "DO_NOT_CONTACT");
  }

  const connection = await prisma.emailConnection.findUnique({ where: { userId: params.userId } });
  if (!connection || connection.status !== "connected") {
    throw new OutreachError("Reconnect your email to continue.", "NEEDS_REAUTH");
  }

  const recipientEmail = params.contactId
    ? (await prisma.contact.findUniqueOrThrow({ where: { id: params.contactId } })).email
    : params.adHocEmail;
  if (!recipientEmail) throw new OutreachError("No recipient email available", "NO_RECIPIENT");

  let thread =
    params.kind !== "email"
      ? await prisma.emailThread.findFirst({ where: { firmId: params.firmId, contactId: params.contactId ?? undefined }, orderBy: { createdAt: "desc" } })
      : null;

  try {
    const sendResult = await sendOutreachEmail({
      userId: params.userId,
      to: recipientEmail,
      subject: params.subject,
      body: params.message,
      attachments: params.attachments,
      existingProviderThreadId: thread?.providerThreadId,
    });

    if (!thread) {
      thread = await prisma.emailThread.create({
        data: {
          firmId: params.firmId,
          contactId: params.contactId ?? null,
          adHocRecipientName: params.contactId ? null : params.adHocName,
          adHocRecipientEmail: params.contactId ? null : params.adHocEmail,
          subject: params.subject,
          providerThreadId: sendResult.providerThreadId,
          status: "awaiting_reply",
        },
      });
    } else {
      await prisma.emailThread.update({
        where: { id: thread.id },
        data: {
          status: "awaiting_reply",
          lastActivityAt: new Date(),
          followUpSentAt: params.kind === "follow_up" ? new Date() : thread.followUpSentAt,
        },
      });
    }

    await prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        direction: "outbound",
        body: params.message,
        isFollowUp: params.kind === "follow_up",
        providerMessageId: sendResult.providerMessageId ?? null,
        attachments: attachmentsForStorage(params.attachments),
      },
    });

    const actionLabel = params.kind === "follow_up" ? "Follow-up" : params.kind === "term_sheet" ? "Term Sheet / LOI" : "Email";
    await prisma.activityLog.create({
      data: { firmId: params.firmId, contactId: params.contactId, type: "email_sent", body: `${actionLabel} sent: "${params.subject}"`, createdById: params.userId },
    });

    let nextStage: CrmStage;
    if (params.kind === "email") {
      nextStage = "email_sent";
      await completePendingTask(params.firmId, firm.name, "send_email");
    } else if (params.kind === "follow_up") {
      nextStage = "follow_up_sent";
      await completePendingTask(params.firmId, firm.name, "send_follow_up");
    } else {
      nextStage = "term_sheet_sent";
      await completePendingTask(params.firmId, firm.name, "send_term_sheet");
    }

    await prisma.crmStageRow.update({ where: { firmId: params.firmId }, data: { stage: nextStage, stageChangedAt: new Date() } });
    await prisma.activityLog.create({
      data: { firmId: params.firmId, type: "stage_change", body: `Stage changed to ${nextStage}`, createdById: params.userId },
    });

    return { threadId: thread.id };
  } catch (e) {
    if (e instanceof Error && e.message === "NEEDS_REAUTH") {
      throw new OutreachError("Reconnect your email to continue.", "NEEDS_REAUTH");
    }
    throw new OutreachError(e instanceof Error ? e.message : "Send failed");
  }
}
