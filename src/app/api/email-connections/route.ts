import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const connection = await prisma.emailConnection.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ connection });
}
