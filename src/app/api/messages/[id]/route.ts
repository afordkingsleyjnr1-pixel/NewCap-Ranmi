import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

// Clears the unread flag when a thread is opened in the Messages UI.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  if ("isRead" in body) {
    await prisma.emailThread.update({ where: { id }, data: { hasUnreadReply: !body.isRead } });
  }
  return NextResponse.json({ ok: true });
}
