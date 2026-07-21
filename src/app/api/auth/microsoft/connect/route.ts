import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getMicrosoftAuthUrl, isMicrosoftConfigured } from "@/lib/services/microsoft-oauth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isMicrosoftConfigured()) {
    return NextResponse.json({ error: "Microsoft OAuth is not configured. Add MICROSOFT_CLIENT_ID/SECRET in .env." }, { status: 400 });
  }
  const url = getMicrosoftAuthUrl(user.id);
  return NextResponse.redirect(url);
}
