import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const editable = ["firmId", "contactId", "replyToThreadId", "toName", "toEmail", "ccEmails", "bccEmails", "subject", "body", "attachments"];
  const data: Record<string, unknown> = {};
  for (const f of editable) if (f in body) data[f] = body[f];

  const { count } = await prisma.messageDraft.updateMany({ where: { id, createdById: user.id }, data });
  if (count === 0) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  const draft = await prisma.messageDraft.findUnique({ where: { id } });
  return NextResponse.json({ draft });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const { count } = await prisma.messageDraft.deleteMany({ where: { id, createdById: user.id } });
  if (count === 0) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
