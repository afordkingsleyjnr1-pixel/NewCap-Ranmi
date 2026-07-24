import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { sendFreeFormMessage } from "@/lib/services/free-form-send";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "send_outreach");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;

  const draft = await prisma.messageDraft.findFirst({ where: { id, createdById: user!.id } });
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  try {
    const result = await sendFreeFormMessage({
      userId: user!.id,
      firmId: draft.firmId,
      contactId: draft.contactId,
      toName: draft.toName ?? undefined,
      toEmail: draft.toEmail ?? undefined,
      cc: draft.ccEmails,
      bcc: draft.bccEmails,
      subject: draft.subject,
      message: draft.body,
      replyToThreadId: draft.replyToThreadId ?? undefined,
      attachments: (draft.attachments as Array<{ filename: string; mimeType: string; contentBase64: string }> | null) ?? undefined,
    });
    await prisma.messageDraft.delete({ where: { id } });
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
