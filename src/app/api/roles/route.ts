import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const roles = await prisma.role.findMany({ include: { _count: { select: { users: true } } }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ roles });
}

// Section 5.13 step 4 — Create Role.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_team");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const body = await req.json();
  const role = await prisma.role.create({
    data: { name: body.name, permissions: body.permissions ?? [], dataScope: body.dataScope ?? "all_firms" },
  });
  return NextResponse.json({ role });
}
