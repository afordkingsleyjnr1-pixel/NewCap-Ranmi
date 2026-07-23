import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { sendOutreachEmail } from "@/lib/services/email-send";

// Messages section — free-form send. Deliberately bypasses the CRM outreach
// pipeline (/api/outreach/send): no Do Not Contact gate, no forced stage
// change, no pending-task completion. A firm/contact link is optional and,
// if present, is for record-keeping only (shows on that firm's Activity tab).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "send_outreach");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const { firmId, contactId, toName, toEmail, subject, message } = body as {
    firmId?: string | null;
    contactId?: string | null;
    toName?: string;
    toEmail?: string;
    subject: string;
    message: string;
  };

  const recipientEmail = contactId ? (await prisma.contact.findUniqueOrThrow({ where: { id: contactId } })).email : toEmail;
  if (!recipientEmail) return NextResponse.json({ error: "No recipient email address given" }, { status: 400 });
  if (!subject?.trim() || !message?.trim()) return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });

  const connection = await prisma.emailConnection.findUnique({ where: { userId: user!.id } });
  if (!connection || connection.status !== "connected") {
    return NextResponse.json({ error: "NEEDS_REAUTH", message: "Reconnect your email to continue." }, { status: 409 });
  }

  try {
    const sendResult = await sendOutreachEmail({ userId: user!.id, to: recipientEmail, subject, body: message });

    const thread = await prisma.emailThread.create({
      data: {
        firmId: firmId || null,
        contactId: contactId || null,
        adHocRecipientName: contactId ? null : toName || null,
        adHocRecipientEmail: contactId ? null : recipientEmail,
        subject,
        providerThreadId: sendResult.providerThreadId,
        status: "awaiting_reply",
        isFreeForm: true,
      },
    });

    await prisma.emailMessage.create({
      data: { threadId: thread.id, direction: "outbound", body: message, isFollowUp: false },
    });

    if (firmId) {
      await prisma.activityLog.create({
        data: { firmId, contactId, type: "email_sent", body: `Message sent: "${subject}"`, createdById: user!.id },
      });
    }

    return NextResponse.json({ threadId: thread.id });
  } catch (e) {
    if (e instanceof Error && e.message === "NEEDS_REAUTH") {
      return NextResponse.json({ error: "NEEDS_REAUTH", message: "Reconnect your email to continue." }, { status: 409 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Send failed" }, { status: 500 });
  }
}
