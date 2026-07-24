import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { signSession, SESSION_COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { email, password, rememberMe } = await req.json();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash || user.status !== "active") {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  const token = signSession(user.id);
  const res = NextResponse.json({ ok: true });
  // Remember Me controls the browser cookie's own lifetime — unchecked, it's
  // a session cookie that clears on browser close; the signed JWT itself is
  // always valid for 30 days either way (see signSession).
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(rememberMe === false ? {} : { maxAge: 60 * 60 * 24 * 30 }),
  });
  return res;
}
