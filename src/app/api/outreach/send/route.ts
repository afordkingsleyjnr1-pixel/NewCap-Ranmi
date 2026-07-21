import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { sendOutreachEmail } from "@/lib/services/email-send";

// Section 5.7 — Send Email / Send Follow-Up: one shared compose-and-track pipeline.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "send_outreach");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const { firmId, contactId, adHocName, adHocEmail, subject, message, isFollowUp } = body as {
    firmId: string;
    contactId?: string;
    adHocName?: string;
    adHocEmail?: string;
    subject: string;
    message: string;
    isFollowUp?: boolean;
  };

  const crmStage = await prisma.crmStageRow.findUniqueOrThrow({ where: { firmId } });
  if (crmStage.stage === "do_not_contact") {
    return NextResponse.json({ error: "This firm is marked Do Not Contact. Outreach is blocked." }, { status: 403 });
  }

  const connection = await prisma.emailConnection.findUnique({ where: { userId: user!.id } });
  if (!connection || connection.status !== "connected") {
    return NextResponse.json({ error: "NEEDS_REAUTH", message: "Reconnect your email to continue." }, { status: 409 });
  }

  const recipientEmail = contactId
    ? (await prisma.contact.findUniqueOrThrow({ where: { id: contactId } })).email
    : adHocEmail;
  if (!recipientEmail) return NextResponse.json({ error: "No recipient email available" }, { status: 400 });

  let thread = isFollowUp
    ? await prisma.emailThread.findFirst({ where: { firmId, contactId: contactId ?? undefined }, orderBy: { createdAt: "desc" } })
    : null;

  try {
    const sendResult = await sendOutreachEmail({
      userId: user!.id,
      to: recipientEmail,
      subject,
      body: message,
      existingProviderThreadId: thread?.providerThreadId,
    });

    if (!thread) {
      thread = await prisma.emailThread.create({
        data: {
          firmId,
          contactId: contactId ?? null,
          adHocRecipientName: contactId ? null : adHocName,
          adHocRecipientEmail: contactId ? null : adHocEmail,
          subject,
          providerThreadId: sendResult.providerThreadId,
          status: "awaiting_reply",
        },
      });
    } else {
      await prisma.emailThread.update({
        where: { id: thread.id },
        data: { status: "awaiting_reply", lastActivityAt: new Date(), followUpSentAt: new Date() },
      });
    }

    await prisma.emailMessage.create({
      data: { threadId: thread.id, direction: "outbound", body: message, isFollowUp: !!isFollowUp },
    });
    await prisma.activityLog.create({
      data: { firmId, contactId, type: "email_sent", body: `${isFollowUp ? "Follow-up" : "Email"} sent: "${subject}"`, createdById: user!.id },
    });

    const nextStage = isFollowUp ? "follow_up_due" : "outreach_sent";
    await prisma.crmStageRow.update({ where: { firmId }, data: { stage: nextStage, stageChangedAt: new Date() } });
    await prisma.activityLog.create({
      data: { firmId, type: "stage_change", body: `Stage changed to ${nextStage}`, createdById: user!.id },
    });

    return NextResponse.json({ threadId: thread.id });
  } catch (e) {
    if (e instanceof Error && e.message === "NEEDS_REAUTH") {
      return NextResponse.json({ error: "NEEDS_REAUTH", message: "Reconnect your email to continue." }, { status: 409 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Send failed" }, { status: 500 });
  }
}
