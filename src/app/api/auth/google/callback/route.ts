import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exchangeGoogleCode, storeGoogleTokens, getGoogleOAuthClient } from "@/lib/services/google-oauth";
import { google } from "googleapis";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const userId = searchParams.get("state");
  if (!code || !userId) return NextResponse.redirect(new URL("/settings?error=oauth", req.url));

  try {
    const tokens = await exchangeGoogleCode(code);
    const client = getGoogleOAuthClient();
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data: profile } = await oauth2.userinfo.get();

    // Section 4.8 — one active connection per user; connecting a second provider replaces the first.
    await prisma.emailConnection.upsert({
      where: { userId },
      create: {
        userId,
        provider: "gmail",
        oauthTokenRef: storeGoogleTokens({ access_token: tokens.access_token!, refresh_token: tokens.refresh_token!, expiry_date: tokens.expiry_date ?? undefined }),
        connectedEmail: profile.email ?? "unknown",
        status: "connected",
      },
      update: {
        provider: "gmail",
        oauthTokenRef: storeGoogleTokens({ access_token: tokens.access_token!, refresh_token: tokens.refresh_token!, expiry_date: tokens.expiry_date ?? undefined }),
        connectedEmail: profile.email ?? "unknown",
        status: "connected",
      },
    });

    return NextResponse.redirect(new URL("/settings?connected=gmail", req.url));
  } catch (e) {
    // Swallowing this used to leave the user with zero explanation for why
    // "Allow" didn't result in a connected mailbox — log server-side and
    // pass a real reason through so Settings can show it instead of a
    // generic "check your OAuth configuration."
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Gmail OAuth callback failed:", e);
    const url = new URL("/settings", req.url);
    url.searchParams.set("error", "oauth");
    url.searchParams.set("reason", message);
    return NextResponse.redirect(url);
  }
}
