import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { createNotification } from "@/lib/services/notifications";
import { sendInviteEmail } from "@/lib/services/team-invite";
import { getBaseUrl } from "@/lib/request-url";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_team");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const body = await req.json();
  const target = await prisma.user.findUniqueOrThrow({ where: { id } });

  // Section 5.13 step 11 — deactivating forces reassignment of every firm they own first.
  if (body.action === "deactivate") {
    const ownedFirms = await prisma.crmStageRow.findMany({ where: { ownerId: id } });
    if (ownedFirms.length > 0 && !body.reassignToUserId) {
      return NextResponse.json(
        { error: "REASSIGN_REQUIRED", ownedFirmsCount: ownedFirms.length, message: "Reassign this person's firms before deactivating." },
        { status: 400 }
      );
    }
    if (ownedFirms.length > 0) {
      await prisma.crmStageRow.updateMany({ where: { ownerId: id }, data: { ownerId: body.reassignToUserId } });
      await createNotification({
        userId: body.reassignToUserId,
        type: "firms_reassigned",
        body: `You've inherited ${ownedFirms.length} firm(s) from ${target.name}, who was deactivated.`,
      });
    }
    const updated = await prisma.user.update({ where: { id }, data: { status: "deactivated" } });
    return NextResponse.json({ user: updated });
  }

  if (body.action === "resend_invite") {
    const inviteLink = `/accept-invite?token=${id}`;
    const emailSent = await sendInviteEmail(user!.id, user!.name, target.email, `${getBaseUrl(req)}${inviteLink}`);
    return NextResponse.json({ ok: true, inviteLink, emailSent });
  }

  if (body.action === "revoke_invite") {
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "change_role") {
    const updated = await prisma.user.update({ where: { id }, data: { roleId: body.roleId } });
    await createNotification({ userId: id, type: "role_changed", body: "Your role was changed." });
    return NextResponse.json({ user: updated });
  }

  // Edit — name always editable; email only while still pending (an active
  // user's email is also their login, so changing it here would strand
  // anyone already using it to sign in).
  if (body.action === "edit") {
    if (target.isAccountOwner && body.roleId && body.roleId !== target.roleId) {
      return NextResponse.json({ error: "The workspace owner's role can't be changed." }, { status: 400 });
    }
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.roleId) data.roleId = body.roleId;
    if (typeof body.email === "string" && body.email.trim() && target.status === "pending_invite") {
      data.email = body.email.trim().toLowerCase();
    }
    const updated = await prisma.user.update({ where: { id }, data });
    if (data.roleId && data.roleId !== target.roleId) {
      await createNotification({ userId: id, type: "role_changed", body: "Your role was changed." });
    }
    return NextResponse.json({ user: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// Permanently removes a user — only ever safe for someone who was never
// truly "in" the workspace (still pending) or already fully offboarded
// (deactivated, with their owned firms already reassigned). An active
// user must be deactivated first — that flow already forces reassignment
// of everything they own before it's safe to remove them from view.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_team");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const target = await prisma.user.findUniqueOrThrow({ where: { id } });

  if (target.isAccountOwner) {
    return NextResponse.json({ error: "The workspace owner can't be deleted." }, { status: 400 });
  }
  if (target.status === "active") {
    return NextResponse.json({ error: "Deactivate this person before deleting them." }, { status: 400 });
  }

  try {
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "This person has historical records (activity, tasks, sent messages) tied to their account and can't be fully deleted. They stay hidden as deactivated." },
      { status: 400 }
    );
  }
}
