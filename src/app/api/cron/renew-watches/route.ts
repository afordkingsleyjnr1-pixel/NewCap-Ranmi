import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedGoogleClient } from "@/lib/services/google-oauth";
import { google } from "googleapis";

// Section 5.7 step 7a — Gmail watch() expires every 7 days, Graph subscriptions
// every ~3 days. Renew every active connection before expiry so reply detection
// doesn't quietly stop working. Run daily via external scheduler (vercel.json).
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const connections = await prisma.emailConnection.findMany({
    where: { status: "connected", OR: [{ watchExpiresAt: null }, { watchExpiresAt: { lte: soon } }] },
  });

  let renewed = 0;
  for (const conn of connections) {
    try {
      if (conn.provider === "gmail" && process.env.GMAIL_PUBSUB_TOPIC) {
        const auth = await getAuthenticatedGoogleClient(conn.userId);
        const gmail = google.gmail({ version: "v1", auth });
        const res = await gmail.users.watch({ userId: "me", requestBody: { topicName: process.env.GMAIL_PUBSUB_TOPIC, labelIds: ["INBOX"] } });
        await prisma.emailConnection.update({
          where: { id: conn.id },
          data: { watchExpiresAt: res.data.expiration ? new Date(Number(res.data.expiration)) : new Date(Date.now() + 6 * 24 * 60 * 60 * 1000) },
        });
        renewed++;
      }
      // Outlook subscription renewal would call client.api(`/subscriptions/${id}`).patch({...})
      // once the subscription id is persisted; omitted here pending MICROSOFT credentials.
    } catch {
      // leave watchExpiresAt as-is; will retry next run
    }
  }

  return NextResponse.json({ renewed });
}
