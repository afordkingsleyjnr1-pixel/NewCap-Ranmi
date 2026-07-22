import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedGraphClient } from "@/lib/services/microsoft-oauth";
import { handleInboundReply } from "@/lib/services/reply-handling";

// Section 5.7 step 7 — Microsoft Graph mail subscription webhook.
export async function GET(req: NextRequest) {
  // Graph validation handshake: echo back validationToken as text/plain.
  const token = new URL(req.url).searchParams.get("validationToken");
  if (token) return new NextResponse(token, { status: 200, headers: { "Content-Type": "text/plain" } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  for (const notif of body.value ?? []) {
    const connection = await prisma.emailConnection.findFirst({
      where: { provider: "outlook", oauthTokenRef: { not: "" } },
    });
    if (!connection) continue;

    try {
      const client = await getAuthenticatedGraphClient(connection.userId);
      const message = await client.api(`/me/messages/${notif.resourceData?.id}`).get();
      const conversationId = message.conversationId;

      const thread = await prisma.emailThread.findFirst({ where: { providerThreadId: conversationId } });
      if (!thread) continue;

      await handleInboundReply({ threadId: thread.id, body: message.body?.content ?? "", notifyUserId: connection.userId });
    } catch {
      // non-fatal per-notification
    }
  }

  return NextResponse.json({ ok: true });
}
