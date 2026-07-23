import { prisma } from "@/lib/db";
import { google } from "googleapis";
import { getAuthenticatedGoogleClient } from "./google-oauth";
import { getAuthenticatedGraphClient } from "./microsoft-oauth";
import { handleInboundReply } from "./reply-handling";

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

        const bodyText = Buffer.from(
          msg.payload?.parts?.find((p) => p.mimeType === "text/plain")?.body?.data ?? msg.payload?.body?.data ?? "",
          "base64"
        ).toString("utf8");

        await handleInboundReply({
          threadId: thread.id,
          body: bodyText,
          notifyUserId: connection.userId,
          providerMessageId: msg.id,
          sentAt: msg.internalDate ? new Date(Number(msg.internalDate)) : undefined,
        });
      }
    } catch {
      // One thread failing (deleted upstream, transient API error) shouldn't block the rest.
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
        .select("id,from,body,receivedDateTime")
        .get();

      const existing = await prisma.emailMessage.findMany({ where: { threadId: thread.id }, select: { providerMessageId: true } });
      const seen = new Set(existing.map((m: { providerMessageId: string | null }) => m.providerMessageId).filter(Boolean));

      for (const msg of res.value ?? []) {
        if (!msg.id || seen.has(msg.id)) continue;
        const fromAddress: string = msg.from?.emailAddress?.address ?? "";
        const isInbound = fromAddress.toLowerCase() !== connection.connectedEmail.toLowerCase();
        if (!isInbound) continue;

        await handleInboundReply({
          threadId: thread.id,
          body: msg.body?.content ?? "",
          notifyUserId: connection.userId,
          providerMessageId: msg.id,
          sentAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : undefined,
        });
      }
    } catch {
      // One thread failing shouldn't block the rest.
    }
  }
}
