import { prisma } from "@/lib/db";
import { google, gmail_v1 } from "googleapis";
import type { Client } from "@microsoft/microsoft-graph-client";
import { getAuthenticatedGoogleClient } from "./google-oauth";
import { getAuthenticatedGraphClient } from "./microsoft-oauth";
import { handleInboundReply, ingestNewInboundThread } from "./reply-handling";

const MAX_STORED_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/**
 * Polling-based reply ingestion. The platform was originally built around
 * Gmail Pub/Sub push notifications and Microsoft Graph subscriptions, but
 * both require cloud infrastructure (a GCP Pub/Sub topic + subscription,
 * a Graph subscription with renewal) that was never actually provisioned —
 * Outlook's subscription creation was never even implemented. So nothing
 * was ever calling handleInboundReply, and replies never reached the
 * platform. This runs on demand (every Messages page load/refresh, plus a
 * client-side interval) instead: for each connected mailbox, check every
 * thread with a provider thread ID directly against Gmail/Outlook and pull
 * in any message not yet recorded, using EmailMessage.providerMessageId to
 * dedupe across repeated runs. No extra setup required from the user.
 *
 * On top of that, discoverNew*Threads below finds inbound email that never
 * went through the platform at all — a contact emailing the connected
 * mailbox directly rather than replying to something sent from here — and
 * pulls it in as a new thread if the sender matches a known contact.
 */
export async function syncAllReplies(): Promise<void> {
  const connections = await prisma.emailConnection.findMany({ where: { status: "connected" } });
  await Promise.all(
    connections.map((c: { userId: string; connectedEmail: string; provider: string }) =>
      (c.provider === "gmail" ? syncGmailConnection(c) : syncOutlookConnection(c)).catch(() => {})
    )
  );
}

// Throttled variant for endpoints polled frequently from the UI (Messages
// page, notification bell) — avoids hitting Gmail/Outlook's API on every
// single poll. Best-effort only; resets on cold start, which is fine since
// the worst case is just one extra sync.
let lastSyncAt = 0;
export async function syncAllRepliesThrottled(minIntervalMs = 15_000): Promise<void> {
  if (Date.now() - lastSyncAt < minIntervalMs) return;
  lastSyncAt = Date.now();
  await syncAllReplies();
}

function decodeGmailBase64(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

async function extractGmailAttachments(
  gmail: gmail_v1.Gmail,
  messageId: string,
  parts: gmail_v1.Schema$MessagePart[] | undefined
): Promise<Array<{ filename: string; mimeType: string; contentBase64?: string }>> {
  if (!parts?.length) return [];
  const results: Array<{ filename: string; mimeType: string; contentBase64?: string }> = [];
  for (const part of parts) {
    if (part.filename && part.body?.attachmentId) {
      const meta: { filename: string; mimeType: string; contentBase64?: string } = {
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
      };
      const size = part.body.size ?? 0;
      if (size > 0 && size <= MAX_STORED_ATTACHMENT_BYTES) {
        try {
          const att = await gmail.users.messages.attachments.get({ userId: "me", messageId, id: part.body.attachmentId });
          if (att.data.data) meta.contentBase64 = Buffer.from(att.data.data, "base64url").toString("base64");
        } catch {
          // Metadata still shows even if the content fetch fails.
        }
      }
      results.push(meta);
    }
    if (part.parts?.length) results.push(...(await extractGmailAttachments(gmail, messageId, part.parts)));
  }
  return results;
}

function parseFromHeader(from: string): { email: string; name: string | null } {
  const emailMatch = from.match(/<([^>]+)>/);
  const email = (emailMatch ? emailMatch[1] : from).trim().toLowerCase();
  const nameMatch = from.match(/^"?([^"<]+)"?\s*</);
  const name = nameMatch ? nameMatch[1].trim() : null;
  return { email, name };
}

async function syncGmailConnection(connection: { userId: string; connectedEmail: string }) {
  const auth = await getAuthenticatedGoogleClient(connection.userId);
  const gmail = google.gmail({ version: "v1", auth });

  const threads = await prisma.emailThread.findMany({ where: { providerThreadId: { not: null } } });

  for (const thread of threads) {
    try {
      const res = await gmail.users.threads.get({ userId: "me", id: thread.providerThreadId!, format: "full" });
      const existing = await prisma.emailMessage.findMany({ where: { threadId: thread.id }, select: { providerMessageId: true } });
      const seen = new Set(existing.map((m: { providerMessageId: string | null }) => m.providerMessageId).filter(Boolean));

      for (const msg of res.data.messages ?? []) {
        if (!msg.id || seen.has(msg.id)) continue;
        const headers = msg.payload?.headers ?? [];
        const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
        const isInbound = !from.toLowerCase().includes(connection.connectedEmail.toLowerCase());
        if (!isInbound) continue;

        const bodyText = decodeGmailBase64(msg.payload?.parts?.find((p) => p.mimeType === "text/plain")?.body?.data ?? msg.payload?.body?.data ?? "");
        const ccHeader = headers.find((h) => h.name?.toLowerCase() === "cc")?.value ?? "";
        const ccEmails = ccHeader
          ? ccHeader.split(",").map((s) => parseFromHeader(s.trim()).email).filter(Boolean)
          : [];
        const attachments = await extractGmailAttachments(gmail, msg.id, msg.payload?.parts);

        await handleInboundReply({
          threadId: thread.id,
          body: bodyText,
          notifyUserId: connection.userId,
          providerMessageId: msg.id,
          sentAt: msg.internalDate ? new Date(Number(msg.internalDate)) : undefined,
          ccEmails,
          attachments,
        });
      }
    } catch {
      // One thread failing (deleted upstream, transient API error) shouldn't block the rest.
    }
  }

  await discoverNewGmailThreads(connection, gmail);
}

/**
 * Finds inbound Gmail threads that never went through the platform (so
 * there's no EmailThread with a matching provider_thread_id yet) but whose
 * sender matches a known Contact — e.g. the contact emailed the connected
 * mailbox directly. Seeds a new EmailThread from the first matching
 * message; the ordinary per-thread sync above picks up any other messages
 * in that Gmail thread on the next run now that it's tracked.
 */
async function discoverNewGmailThreads(connection: { userId: string; connectedEmail: string }, gmail: gmail_v1.Gmail) {
  const contacts = await prisma.contact.findMany({
    where: { removedAt: null, OR: [{ email: { not: null } }, { NOT: { alternateEmails: { isEmpty: true } } }] },
    select: { id: true, firmId: true, email: true, alternateEmails: true },
  });
  const emailToContact = new Map<string, { id: string; firmId: string }>();
  for (const c of contacts) {
    if (c.email) emailToContact.set(c.email.toLowerCase(), { id: c.id, firmId: c.firmId });
    for (const alt of c.alternateEmails) emailToContact.set(alt.toLowerCase(), { id: c.id, firmId: c.firmId });
  }
  if (emailToContact.size === 0) return;

  const knownThreadIds = new Set(
    (await prisma.emailThread.findMany({ where: { providerThreadId: { not: null } }, select: { providerThreadId: true } })).map(
      (t: { providerThreadId: string | null }) => t.providerThreadId
    )
  );

  const fromClauses = Array.from(emailToContact.keys())
    .slice(0, 50)
    .map((e) => `from:${e}`)
    .join(" OR ");
  const listRes = await gmail.users.threads.list({ userId: "me", q: `in:inbox newer_than:30d (${fromClauses})`, maxResults: 15 });

  for (const t of listRes.data.threads ?? []) {
    if (!t.id || knownThreadIds.has(t.id)) continue;
    try {
      const full = await gmail.users.threads.get({ userId: "me", id: t.id, format: "full" });
      const firstInbound = (full.data.messages ?? []).find((m) => {
        const from = m.payload?.headers?.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
        return !from.toLowerCase().includes(connection.connectedEmail.toLowerCase());
      });
      if (!firstInbound?.id) continue;

      const headers = firstInbound.payload?.headers ?? [];
      const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
      const { email: fromEmail, name: fromName } = parseFromHeader(from);
      const contactMatch = emailToContact.get(fromEmail);
      if (!contactMatch) continue;

      const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "(no subject)";
      const bodyText = decodeGmailBase64(
        firstInbound.payload?.parts?.find((p) => p.mimeType === "text/plain")?.body?.data ?? firstInbound.payload?.body?.data ?? ""
      );
      const attachments = await extractGmailAttachments(gmail, firstInbound.id, firstInbound.payload?.parts);

      await ingestNewInboundThread({
        subject,
        body: bodyText,
        fromEmail,
        fromName,
        contactId: contactMatch.id,
        firmId: contactMatch.firmId,
        notifyUserId: connection.userId,
        providerThreadId: t.id,
        providerMessageId: firstInbound.id,
        sentAt: firstInbound.internalDate ? new Date(Number(firstInbound.internalDate)) : undefined,
        attachments,
      });
      knownThreadIds.add(t.id);
    } catch {
      // One thread failing shouldn't block discovery of the rest.
    }
  }
}

async function syncOutlookConnection(connection: { userId: string; connectedEmail: string }) {
  const client = await getAuthenticatedGraphClient(connection.userId);

  const threads = await prisma.emailThread.findMany({ where: { providerThreadId: { not: null } } });

  for (const thread of threads) {
    try {
      const res = await client
        .api("/me/messages")
        .filter(`conversationId eq '${thread.providerThreadId}'`)
        .select("id,from,body,receivedDateTime,ccRecipients,hasAttachments")
        .get();

      const existing = await prisma.emailMessage.findMany({ where: { threadId: thread.id }, select: { providerMessageId: true } });
      const seen = new Set(existing.map((m: { providerMessageId: string | null }) => m.providerMessageId).filter(Boolean));

      for (const msg of res.value ?? []) {
        if (!msg.id || seen.has(msg.id)) continue;
        const fromAddress: string = msg.from?.emailAddress?.address ?? "";
        const isInbound = fromAddress.toLowerCase() !== connection.connectedEmail.toLowerCase();
        if (!isInbound) continue;

        const ccEmails: string[] = (msg.ccRecipients ?? []).map((r: { emailAddress?: { address?: string } }) => r.emailAddress?.address?.toLowerCase()).filter(Boolean);
        const attachments = msg.hasAttachments ? await fetchOutlookAttachments(client, msg.id) : [];

        await handleInboundReply({
          threadId: thread.id,
          body: msg.body?.content ?? "",
          notifyUserId: connection.userId,
          providerMessageId: msg.id,
          sentAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : undefined,
          ccEmails,
          attachments,
        });
      }
    } catch {
      // One thread failing shouldn't block the rest.
    }
  }

  await discoverNewOutlookThreads(connection, client);
}

async function fetchOutlookAttachments(
  client: Client,
  messageId: string
): Promise<Array<{ filename: string; mimeType: string; contentBase64?: string }>> {
  try {
    const res = await client.api(`/me/messages/${messageId}/attachments`).get();
    return (res.value ?? [])
      .filter((a: { "@odata.type"?: string; size?: number }) => a["@odata.type"] === "#microsoft.graph.fileAttachment")
      .map((a: { name: string; contentType: string; contentBytes?: string; size?: number }) => ({
        filename: a.name,
        mimeType: a.contentType,
        contentBase64: a.size && a.size <= MAX_STORED_ATTACHMENT_BYTES ? a.contentBytes : undefined,
      }));
  } catch {
    return [];
  }
}

/** Outlook equivalent of discoverNewGmailThreads — see that function for the rationale. */
async function discoverNewOutlookThreads(connection: { userId: string; connectedEmail: string }, client: Client) {
  const contacts = await prisma.contact.findMany({
    where: { removedAt: null, OR: [{ email: { not: null } }, { NOT: { alternateEmails: { isEmpty: true } } }] },
    select: { id: true, firmId: true, email: true, alternateEmails: true },
  });
  const emailToContact = new Map<string, { id: string; firmId: string }>();
  for (const c of contacts) {
    if (c.email) emailToContact.set(c.email.toLowerCase(), { id: c.id, firmId: c.firmId });
    for (const alt of c.alternateEmails) emailToContact.set(alt.toLowerCase(), { id: c.id, firmId: c.firmId });
  }
  if (emailToContact.size === 0) return;

  const knownThreadIds = new Set(
    (await prisma.emailThread.findMany({ where: { providerThreadId: { not: null } }, select: { providerThreadId: true } })).map(
      (t: { providerThreadId: string | null }) => t.providerThreadId
    )
  );

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let messages: Array<{
    id: string;
    conversationId?: string;
    from?: { emailAddress?: { address?: string; name?: string } };
    subject?: string;
    body?: { content?: string };
    receivedDateTime?: string;
    hasAttachments?: boolean;
  }> = [];
  try {
    const res = await client
      .api("/me/mailFolders/inbox/messages")
      .filter(`receivedDateTime ge ${cutoff}`)
      .orderby("receivedDateTime desc")
      .top(25)
      .select("id,conversationId,from,subject,body,receivedDateTime,hasAttachments")
      .get();
    messages = res.value ?? [];
  } catch {
    return;
  }

  const seenConversations = new Set<string>();
  for (const msg of messages) {
    const conversationId = msg.conversationId;
    if (!conversationId || knownThreadIds.has(conversationId) || seenConversations.has(conversationId)) continue;
    const fromEmail = msg.from?.emailAddress?.address?.toLowerCase();
    if (!fromEmail) continue;
    const contactMatch = emailToContact.get(fromEmail);
    if (!contactMatch) continue;

    seenConversations.add(conversationId);
    const attachments = msg.hasAttachments ? await fetchOutlookAttachments(client, msg.id) : [];

    await ingestNewInboundThread({
      subject: msg.subject ?? "(no subject)",
      body: msg.body?.content ?? "",
      fromEmail,
      fromName: msg.from?.emailAddress?.name ?? null,
      contactId: contactMatch.id,
      firmId: contactMatch.firmId,
      notifyUserId: connection.userId,
      providerThreadId: conversationId,
      providerMessageId: msg.id,
      sentAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : undefined,
      attachments,
    });
  }
}
