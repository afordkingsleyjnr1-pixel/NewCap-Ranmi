import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

// Drafts folder — messages saved but not sent. Scoped to the user who wrote
// them (there's no shared-mailbox concept here — each user sends from their
// own connected mailbox).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const drafts = await prisma.messageDraft.findMany({
    where: { createdById: user.id },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ drafts });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await req.json();

  const draft = await prisma.messageDraft.create({
    data: {
      createdById: user.id,
      firmId: body.firmId || null,
      contactId: body.contactId || null,
      replyToThreadId: body.replyToThreadId || null,
      toName: body.toName || null,
      toEmail: body.toEmail || null,
      ccEmails: body.ccEmails ?? [],
      bccEmails: body.bccEmails ?? [],
      subject: body.subject ?? "",
      body: body.body ?? "",
      attachments: body.attachments?.length ? body.attachments : undefined,
    },
  });
  return NextResponse.json({ draft });
}
