import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

interface StoredAttachment {
  filename: string;
  mimeType: string;
  contentBase64?: string;
}

// Streams a stored attachment back for download (or inline display for
// images) — ?index= picks which attachment on the message, since a message
// can have several.
export async function GET(req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { messageId } = await params;
  const index = Number(req.nextUrl.searchParams.get("index") ?? "0");

  const message = await prisma.emailMessage.findUnique({ where: { id: messageId } });
  if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 });

  const attachments = (message.attachments as StoredAttachment[] | null) ?? [];
  const attachment = attachments[index];
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  if (!attachment.contentBase64) {
    return NextResponse.json({ error: "This attachment was too large to store and can't be downloaded from here." }, { status: 404 });
  }

  const bytes = Buffer.from(attachment.contentBase64, "base64");
  const inline = attachment.mimeType.startsWith("image/") || attachment.mimeType === "application/pdf";

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${attachment.filename.replace(/"/g, "")}"`,
      "Content-Length": String(bytes.length),
    },
  });
}
