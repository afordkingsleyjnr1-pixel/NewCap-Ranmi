import { google } from "googleapis";
import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// Section 4.8 — Gmail scopes: gmail.send, gmail.readonly, calendar.events.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function isGoogleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleOAuthClient() {
  if (!isGoogleConfigured()) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set. Configure them to enable Gmail send + Calendar.");
  }
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}

export function getGoogleAuthUrl(state: string): string {
  const client = getGoogleOAuthClient();
  return client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: GOOGLE_SCOPES, state });
}

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expiry_date?: number;
}

export async function exchangeGoogleCode(code: string) {
  const client = getGoogleOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * Returns an authenticated googleapis OAuth2 client for a user's connection,
 * refreshing silently and persisting the new access token. Sets the
 * connection to needs_reauth (Section 4.8) if refresh fails.
 */
export async function getAuthenticatedGoogleClient(userId: string) {
  const connection = await prisma.emailConnection.findUnique({ where: { userId } });
  if (!connection || connection.provider !== "gmail" || connection.status === "disconnected") {
    throw new Error("No connected Gmail account.");
  }

  const tokens: StoredTokens = JSON.parse(decryptSecret(connection.oauthTokenRef));
  const client = getGoogleOAuthClient();
  client.setCredentials({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expiry_date: tokens.expiry_date });

  client.on("tokens", async (newTokens) => {
    const merged = { ...tokens, ...newTokens, refresh_token: newTokens.refresh_token ?? tokens.refresh_token };
    await prisma.emailConnection.update({ where: { userId }, data: { oauthTokenRef: encryptSecret(JSON.stringify(merged)) } });
  });

  try {
    await client.getAccessToken();
  } catch {
    await prisma.emailConnection.update({ where: { userId }, data: { status: "needs_reauth" } });
    throw new Error("NEEDS_REAUTH");
  }

  return client;
}

export function storeGoogleTokens(tokens: StoredTokens) {
  return encryptSecret(JSON.stringify(tokens));
}
