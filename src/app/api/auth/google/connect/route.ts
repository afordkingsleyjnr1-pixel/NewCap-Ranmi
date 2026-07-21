import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getGoogleAuthUrl, isGoogleConfigured } from "@/lib/services/google-oauth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isGoogleConfigured()) {
    return NextResponse.json({ error: "Google OAuth is not configured. Add GOOGLE_CLIENT_ID/SECRET in .env." }, { status: 400 });
  }
  const url = getGoogleAuthUrl(user.id);
  return NextResponse.redirect(url);
}
