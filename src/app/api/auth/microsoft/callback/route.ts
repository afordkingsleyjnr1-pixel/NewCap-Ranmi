import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exchangeMicrosoftCode, storeMicrosoftTokens } from "@/lib/services/microsoft-oauth";
import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const userId = searchParams.get("state");
  if (!code || !userId) return NextResponse.redirect(new URL("/settings?error=oauth", req.url));

  try {
    const tokens = await exchangeMicrosoftCode(code);
    const client = Client.init({ authProvider: (done) => done(null, tokens.access_token) });
    const profile = await client.api("/me").get();

    await prisma.emailConnection.upsert({
      where: { userId },
      create: {
        userId,
        provider: "outlook",
        oauthTokenRef: storeMicrosoftTokens(tokens),
        connectedEmail: profile.mail ?? profile.userPrincipalName ?? "unknown",
        status: "connected",
      },
      update: {
        provider: "outlook",
        oauthTokenRef: storeMicrosoftTokens(tokens),
        connectedEmail: profile.mail ?? profile.userPrincipalName ?? "unknown",
        status: "connected",
      },
    });

    return NextResponse.redirect(new URL("/settings?connected=outlook", req.url));
  } catch {
    return NextResponse.redirect(new URL("/settings?error=oauth", req.url));
  }
}
