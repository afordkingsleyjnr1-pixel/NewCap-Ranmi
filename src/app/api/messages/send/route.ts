import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { sendFreeFormMessage } from "@/lib/services/free-form-send";

// Messages section — free-form send. Deliberately bypasses the CRM outreach
// pipeline (/api/outreach/send): no Do Not Contact gate, no forced stage
// change, no pending-task completion. A firm/contact link is optional and,
// if present, is for record-keeping only (shows on that firm's Activity tab).
//
// Pass `replyToThreadId` to send within an existing thread (Reply/Reply-All
// style send from the Messages UI) instead of starting a new one — reuses
// the thread's provider_thread_id so it lands as an actual reply in
// Gmail/Outlook, same as CRM follow-ups do.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "send_outreach");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const { firmId, contactId, toName, toEmail, cc, bcc, subject, message, replyToThreadId, attachments } = body as {
    firmId?: string | null;
    contactId?: string | null;
    toName?: string;
    toEmail?: string;
    cc?: string[];
    bcc?: string[];
    subject: string;
    message: string;
    replyToThreadId?: string;
    attachments?: Array<{ filename: string; mimeType: string; contentBase64: string }>;
  };

  try {
    const result = await sendFreeFormMessage({
      userId: user!.id,
      firmId,
      contactId,
      toName,
      toEmail,
      cc,
      bcc,
      subject,
      message,
      replyToThreadId,
      attachments,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "NEEDS_REAUTH") {
      return NextResponse.json({ error: "NEEDS_REAUTH", message: "Reconnect your email to continue." }, { status: 409 });
    }
    const message = e instanceof Error ? e.message : "Send failed";
    const status = message === "No recipient email address given" || message === "Subject and message are required" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
