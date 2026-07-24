import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { sendOutreachEmail } from "@/lib/services/email-send";
import { getBaseUrl } from "@/lib/request-url";

// Password reset has no logged-in "sender" to send from (the requester
// isn't authenticated yet), so the email goes out from the workspace
// owner's connected mailbox — the same fallback-sender pattern the invite
// flow already relies on. Always responds with a generic success message
// regardless of whether the email matched an account, so this can't be
// used to enumerate who has one.
export async function POST(req: NextRequest) {
  const { email } = (await req.json()) as { email?: string };
  const generic = NextResponse.json({ ok: true, message: "If an account exists for that email, a reset link has been sent." });
  if (!email?.trim()) return generic;

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || user.status !== "active") return generic;

  const token = randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: token, passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });

  const owner = await prisma.user.findFirst({ where: { isAccountOwner: true } });
  const resetUrl = `${getBaseUrl(req)}/reset-password?token=${token}`;

  if (owner) {
    try {
      await sendOutreachEmail({
        userId: owner.id,
        to: user.email,
        subject: "Reset your NewCap Ranmi password",
        body: `Hi ${user.name},\n\nA password reset was requested for your account. Click the link below to set a new password — this link expires in 1 hour:\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
      });
    } catch {
      // No connected mailbox for the owner, or the send failed. The token
      // is still stored, so the reset link works if shared manually.
    }
  }

  return generic;
}
