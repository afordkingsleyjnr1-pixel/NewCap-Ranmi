import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { VIEWER_ROLE_NAME } from "@/lib/permissions";
import { sendOutreachEmail } from "@/lib/services/email-send";

// Section: Projects Module step 4 — Assign Team Members. Enter an email:
// if the person already has a platform account, they're added to the
// project immediately. If not, a pending account is created (least-privilege
// Viewer role — an admin can upgrade it later in Settings) and, if the
// inviting user has a connected mailbox, an invite email is sent from it
// with the accept-invite link; either way the invite link is also returned
// so it can be shared manually.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_tasks");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id: projectId } = await params;
  const { email } = (await req.json()) as { email: string };
  if (!email?.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  let targetUser = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  let invited = false;
  let inviteLink: string | null = null;

  if (!targetUser) {
    const viewerRole = await prisma.role.findFirst({ where: { name: VIEWER_ROLE_NAME } });
    if (!viewerRole) return NextResponse.json({ error: "No default role available to invite a new user into." }, { status: 500 });

    targetUser = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        name: email.trim().split("@")[0],
        roleId: viewerRole.id,
        status: "pending_invite",
        invitedById: user!.id,
        invitedAt: new Date(),
      },
    });
    invited = true;
    inviteLink = `/accept-invite?token=${targetUser.id}`;

    try {
      await sendOutreachEmail({
        userId: user!.id,
        to: targetUser.email,
        subject: `You've been invited to join "${project.name}" on NewCap`,
        body: `Hi,\n\nYou've been added to the project "${project.name}" on the NewCap platform. Create your account to get started:\n\n${process.env.APP_URL ?? ""}${inviteLink}\n\nBest,\n${user!.name}`,
      });
    } catch {
      // No connected mailbox, or send failed — the invite link is still
      // returned in the response so it can be shared manually.
    }
  }

  const member = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId: targetUser.id } },
    create: { projectId, userId: targetUser.id },
    update: {},
    include: { user: { select: { id: true, name: true, email: true, status: true } } },
  });

  return NextResponse.json({ member, invited, inviteLink });
}
