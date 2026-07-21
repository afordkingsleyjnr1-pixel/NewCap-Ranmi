import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

// Section 5.12 — My Account: intentional Disconnect (distinct from involuntary needs_reauth).
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  await prisma.emailConnection.update({ where: { userId: user.id }, data: { status: "disconnected" } });
  return NextResponse.json({ ok: true });
}
