import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

// Lightweight "who am I / what can I do" endpoint for client components that
// need to conditionally show admin-only UI (e.g. Projects → Add Task) —
// every other permission check in the app happens server-side only, but
// there was no way for a client component to know in advance whether an
// action would be rejected.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const role = await prisma.role.findUniqueOrThrow({ where: { id: user.roleId } });
  return NextResponse.json({ id: user.id, name: user.name, isAccountOwner: user.isAccountOwner, permissions: role.permissions });
}
