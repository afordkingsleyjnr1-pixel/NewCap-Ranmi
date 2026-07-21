import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, isAccountOwner: true, status: true, roleId: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users });
}

// Section 5.13 steps 1-2 — invite: a role must exist before someone can be invited into it.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_team");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const body = await req.json();
  const { email, name, roleId } = body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "A user with this email already exists." }, { status: 400 });

  const newUser = await prisma.user.create({
    data: { email, name, roleId, status: "pending_invite", invitedById: user!.id, invitedAt: new Date() },
  });

  // Email delivery of the invite link is sent via the platform's transactional
  // email provider once configured; the accept link is /accept-invite?token=<user.id>.
  return NextResponse.json({ user: newUser, inviteLink: `/accept-invite?token=${newUser.id}` });
}
