import { prisma } from "@/lib/db";
import { getAuthenticatedGoogleClient, getGmailSignature } from "./google-oauth";
import { getAuthenticatedGraphClient } from "./microsoft-oauth";
import { google } from "googleapis";

export interface OutboundAttachment {
  filename: string;
  mimeType: string;
  contentBase64: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textToHtml(body: string): string {
  return escapeHtml(body).replace(/\n/g, "<br>\n");
}

function buildRawMessage(params: {
  to: string;
  from: string;
  subject: string;
  body: string;
  signatureHtml?: string | null;
  attachments?: OutboundAttachment[];
  inReplyTo?: string;
  references?: string;
}): string {
  const headers = [`To: ${params.to}`, `From: ${params.from}`, `Subject: ${params.subject}`, "MIME-Version: 1.0"];
  if (params.inReplyTo) headers.push(`In-Reply-To: ${params.inReplyTo}`, `References: ${params.references ?? params.inReplyTo}`);

  const hasAttachments = !!params.attachments?.length;
  const hasSignature = !!params.signatureHtml;

  // Plain single-part text/plain when there's nothing extra — keeps the
  // simple case identical to before. HTML (with the signature appended)
  // only when a signature exists; attachments always need multipart/mixed.
  if (!hasAttachments && !hasSignature) {
    headers.push("Content-Type: text/plain; charset=utf-8");
    const message = `${headers.join("\r\n")}\r\n\r\n${params.body}`;
    return Buffer.from(message).toString("base64url");
  }

  const bodyPart = hasSignature ? `<div>${textToHtml(params.body)}</div><br>${params.signatureHtml}` : textToHtml(params.body);

  if (!hasAttachments) {
    headers.push("Content-Type: text/html; charset=utf-8");
    const message = `${headers.join("\r\n")}\r\n\r\n${bodyPart}`;
    return Buffer.from(message).toString("base64url");
  }

  const boundary = `----newcap-${Date.now()}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const parts: string[] = [
    `--${boundary}`,
    hasSignature ? "Content-Type: text/html; charset=utf-8" : "Content-Type: text/plain; charset=utf-8",
    "",
    bodyPart,
    "",
  ];
  for (const att of params.attachments!) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${att.filename}"`,
      "",
      att.contentBase64,
      ""
    );
  }
  parts.push(`--${boundary}--`);

  const message = `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
  return Buffer.from(message).toString("base64url");
}

/**
 * Sends via the user's connected mailbox (never a platform address — Section 5.7).
 * Follow-ups reuse provider_thread_id and are sent as replies in the same thread.
 * Gmail sends automatically get the user's actual Gmail signature (Settings →
 * General → Signature) appended, since sending raw MIME through the API
 * bypasses Gmail's own web compose (which is the only place that signature
 * would normally get inserted). Outlook has no equivalent Graph API for
 * reading a user's configured signature, so that side is send-as-typed only.
 */
export async function sendOutreachEmail(params: {
  userId: string;
  to: string;
  subject: string;
  body: string;
  attachments?: OutboundAttachment[];
  existingProviderThreadId?: string | null;
}): Promise<{ providerThreadId: string; providerMessageId?: string }> {
  const connection = await prisma.emailConnection.findUniqueOrThrow({ where: { userId: params.userId } });

  if (connection.provider === "gmail") {
    const auth = await getAuthenticatedGoogleClient(params.userId);
    const gmail = google.gmail({ version: "v1", auth });
    const signatureHtml = await getGmailSignature(params.userId);

    const raw = buildRawMessage({
      to: params.to,
      from: connection.connectedEmail,
      subject: params.subject,
      body: params.body,
      signatureHtml,
      attachments: params.attachments,
      inReplyTo: params.existingProviderThreadId ?? undefined,
    });

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId: params.existingProviderThreadId ?? undefined },
    });

    return { providerThreadId: res.data.threadId ?? res.data.id ?? "", providerMessageId: res.data.id ?? undefined };
  }

  if (connection.provider === "outlook") {
    const client = await getAuthenticatedGraphClient(params.userId);
    const graphAttachments = params.attachments?.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.filename,
      contentType: a.mimeType,
      contentBytes: a.contentBase64,
    }));

    if (params.existingProviderThreadId) {
      await client.api(`/me/messages/${params.existingProviderThreadId}/reply`).post({
        comment: params.body,
        ...(graphAttachments?.length ? { message: { attachments: graphAttachments } } : {}),
      });
      return { providerThreadId: params.existingProviderThreadId };
    }
    const draft = await client.api("/me/messages").post({
      subject: params.subject,
      body: { contentType: "Text", content: params.body },
      toRecipients: [{ emailAddress: { address: params.to } }],
      ...(graphAttachments?.length ? { attachments: graphAttachments } : {}),
    });
    await client.api(`/me/messages/${draft.id}/send`).post({});
    return { providerThreadId: draft.conversationId ?? draft.id, providerMessageId: draft.id };
  }

  throw new Error("Unsupported email provider");
}
