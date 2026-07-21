import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { google } from "googleapis";
import { getAuthenticatedGoogleClient } from "@/lib/services/google-oauth";
import { createNotification } from "@/lib/services/notifications";

// Section 5.7 step 7 — Gmail push notification webhook (via Pub/Sub). Google
// delivers a base64 Pub/Sub message with {emailAddress, historyId}; we look
// up the connection by mailbox and fetch new history since our last cursor.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const dataB64 = body?.message?.data;
  if (!dataB64) return NextResponse.json({ ok: true });

  const decoded = JSON.parse(Buffer.from(dataB64, "base64").toString("utf8")) as { emailAddress: string; historyId: string };

  const connection = await prisma.emailConnection.findFirst({ where: { connectedEmail: decoded.emailAddress, provider: "gmail" } });
  if (!connection) return NextResponse.json({ ok: true });

  try {
    const auth = await getAuthenticatedGoogleClient(connection.userId);
    const gmail = google.gmail({ version: "v1", auth });

    const history = await gmail.users.history.list({
      userId: "me",
      startHistoryId: decoded.historyId,
      historyTypes: ["messageAdded"],
    });

    for (const h of history.data.history ?? []) {
      for (const added of h.messagesAdded ?? []) {
        const gmailThreadId = added.message?.threadId;
        if (!gmailThreadId) continue;

        const thread = await prisma.emailThread.findFirst({ where: { providerThreadId: gmailThreadId } });
        if (!thread) continue;

        const msg = await gmail.users.messages.get({ userId: "me", id: added.message!.id!, format: "full" });
        const bodyText = Buffer.from(
          msg.data.payload?.parts?.find((p) => p.mimeType === "text/plain")?.body?.data ?? msg.data.payload?.body?.data ?? "",
          "base64"
        ).toString("utf8");

        await prisma.emailMessage.create({ data: { threadId: thread.id, direction: "inbound", body: bodyText, isFollowUp: false } });
        await prisma.emailThread.update({ where: { id: thread.id }, data: { status: "replied", lastActivityAt: new Date() } });
        await prisma.activityLog.create({
          data: { firmId: thread.firmId, contactId: thread.contactId, type: "email_received", body: "Reply received", createdById: null },
        });
        await createNotification({
          userId: connection.userId,
          type: "reply_received",
          relatedFirmId: thread.firmId,
          body: `New reply on "${thread.subject}"`,
        });
      }
    }
  } catch {
    // Swallow — webhook must return 200 quickly regardless; failures are logged server-side.
  }

  return NextResponse.json({ ok: true });
}
