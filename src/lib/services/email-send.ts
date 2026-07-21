import { prisma } from "@/lib/db";
import { getAuthenticatedGoogleClient } from "./google-oauth";
import { getAuthenticatedGraphClient } from "./microsoft-oauth";
import { google } from "googleapis";

function buildRawMessage(params: {
  to: string;
  from: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const headers = [
    `To: ${params.to}`,
    `From: ${params.from}`,
    `Subject: ${params.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
  ];
  if (params.inReplyTo) headers.push(`In-Reply-To: ${params.inReplyTo}`, `References: ${params.references ?? params.inReplyTo}`);
  const message = `${headers.join("\r\n")}\r\n\r\n${params.body}`;
  return Buffer.from(message).toString("base64url");
}

/**
 * Sends via the user's connected mailbox (never a platform address — Section 5.7).
 * Follow-ups reuse provider_thread_id and are sent as replies in the same thread.
 */
export async function sendOutreachEmail(params: {
  userId: string;
  to: string;
  subject: string;
  body: string;
  existingProviderThreadId?: string | null;
}): Promise<{ providerThreadId: string }> {
  const connection = await prisma.emailConnection.findUniqueOrThrow({ where: { userId: params.userId } });

  if (connection.provider === "gmail") {
    const auth = await getAuthenticatedGoogleClient(params.userId);
    const gmail = google.gmail({ version: "v1", auth });

    const raw = buildRawMessage({
      to: params.to,
      from: connection.connectedEmail,
      subject: params.subject,
      body: params.body,
      inReplyTo: params.existingProviderThreadId ?? undefined,
    });

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId: params.existingProviderThreadId ?? undefined },
    });

    return { providerThreadId: res.data.threadId ?? res.data.id ?? "" };
  }

  if (connection.provider === "outlook") {
    const client = await getAuthenticatedGraphClient(params.userId);
    if (params.existingProviderThreadId) {
      await client.api(`/me/messages/${params.existingProviderThreadId}/reply`).post({ comment: params.body });
      return { providerThreadId: params.existingProviderThreadId };
    }
    const draft = await client.api("/me/messages").post({
      subject: params.subject,
      body: { contentType: "Text", content: params.body },
      toRecipients: [{ emailAddress: { address: params.to } }],
    });
    await client.api(`/me/messages/${draft.id}/send`).post({});
    return { providerThreadId: draft.conversationId ?? draft.id };
  }

  throw new Error("Unsupported email provider");
}
