import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

// Clears/sets the unread flag, and moves a thread to/from the Bin — the
// Messages module's Delete / Move to Bin / Restore actions.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if ("isRead" in body) data.hasUnreadReply = !body.isRead;
  if ("deletedAt" in body) data.deletedAt = body.deletedAt ? new Date() : null;

  const thread = await prisma.emailThread.update({ where: { id }, data });
  return NextResponse.json({ thread });
}

// Bin → Delete Forever. Only reachable from an already-Bin'd thread.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const thread = await prisma.emailThread.findUniqueOrThrow({ where: { id } });
  if (!thread.deletedAt) {
    return NextResponse.json({ error: "Move the conversation to the Bin before deleting it permanently." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.emailMessage.deleteMany({ where: { threadId: id } }),
    prisma.emailThread.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
