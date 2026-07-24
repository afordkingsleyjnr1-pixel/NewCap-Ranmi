import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { signSession, SESSION_COOKIE } from "@/lib/session";

// Lets the Accept Invitation page pre-fill the invitee's name/email before
// they've set anything.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const user = await prisma.user.findFirst({ where: { id: token, status: "pending_invite" } });
  if (!user) return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
  return NextResponse.json({ name: user.name, email: user.email });
}

// Section 5.13 step 2 — invitee sets their name/credentials and lands in the shared workspace.
export async function POST(req: NextRequest) {
  const { token, name, password } = await req.json();
  const user = await prisma.user.findFirst({ where: { id: token, status: "pending_invite" } });
  if (!user) return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      status: "active",
      joinedAt: new Date(),
      ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
    },
  });

  const sessionToken = signSession(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/" });
  return res;
}
