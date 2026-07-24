import { sendOutreachEmail } from "./email-send";

/**
 * Sends a team invite email from the inviting admin's own connected
 * mailbox — same pattern used by the Projects module's Assign User invite.
 * Shared by POST /api/users (new invite) and PATCH /api/users/[id]
 * (Resend), which previously never attempted to send anything at all —
 * they only ever returned the accept-invite link — which is why invited
 * teammates never received an email regardless of whether the admin had a
 * mailbox connected.
 */
export async function sendInviteEmail(inviterId: string, inviterName: string, toEmail: string, inviteLink: string): Promise<boolean> {
  try {
    await sendOutreachEmail({
      userId: inviterId,
      to: toEmail,
      subject: "You've been invited to join NewCap Ranmi",
      body: `Hi,\n\nYou've been invited to join the NewCap Ranmi platform. Create your account to get started:\n\n${process.env.APP_URL ?? ""}${inviteLink}\n\nBest,\n${inviterName}`,
    });
    return true;
  } catch {
    // No connected mailbox, or the send failed — the invite link is still
    // returned in the response so it can be shared manually.
    return false;
  }
}
