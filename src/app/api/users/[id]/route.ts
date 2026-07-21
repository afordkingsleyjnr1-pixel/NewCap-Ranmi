import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { createNotification } from "@/lib/services/notifications";

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
    return NextResponse.json({ ok: true, inviteLink: `/accept-invite?token=${id}` });
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

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
