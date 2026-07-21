import "isomorphic-fetch";
import { Client } from "@microsoft/microsoft-graph-client";
import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// Section 4.8 — Outlook scopes: Mail.Send, Mail.Read, Calendars.ReadWrite.
export const MICROSOFT_SCOPES = ["Mail.Send", "Mail.Read", "Calendars.ReadWrite", "offline_access", "User.Read"];

export function isMicrosoftConfigured(): boolean {
  return !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

function authority() {
  return `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID ?? "common"}`;
}

export function getMicrosoftAuthUrl(state: string): string {
  if (!isMicrosoftConfigured()) throw new Error("MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET are not set.");
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
    response_mode: "query",
    scope: MICROSOFT_SCOPES.join(" "),
    state,
  });
  return `${authority()}/oauth2/v2.0/authorize?${params.toString()}`;
}

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export async function exchangeMicrosoftCode(code: string): Promise<StoredTokens> {
  const res = await fetch(`${authority()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
      grant_type: "authorization_code",
      scope: MICROSOFT_SCOPES.join(" "),
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? "Microsoft OAuth exchange failed");
  return { access_token: json.access_token, refresh_token: json.refresh_token, expires_at: Date.now() + json.expires_in * 1000 };
}

async function refreshMicrosoftToken(refreshToken: string): Promise<StoredTokens> {
  const res = await fetch(`${authority()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: MICROSOFT_SCOPES.join(" "),
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? "Microsoft token refresh failed");
  return { access_token: json.access_token, refresh_token: json.refresh_token ?? refreshToken, expires_at: Date.now() + json.expires_in * 1000 };
}

export async function getAuthenticatedGraphClient(userId: string): Promise<Client> {
  const connection = await prisma.emailConnection.findUnique({ where: { userId } });
  if (!connection || connection.provider !== "outlook" || connection.status === "disconnected") {
    throw new Error("No connected Outlook account.");
  }

  let tokens: StoredTokens = JSON.parse(decryptSecret(connection.oauthTokenRef));

  if (Date.now() > tokens.expires_at - 60_000) {
    try {
      tokens = await refreshMicrosoftToken(tokens.refresh_token);
      await prisma.emailConnection.update({ where: { userId }, data: { oauthTokenRef: encryptSecret(JSON.stringify(tokens)) } });
    } catch {
      await prisma.emailConnection.update({ where: { userId }, data: { status: "needs_reauth" } });
      throw new Error("NEEDS_REAUTH");
    }
  }

  return Client.init({ authProvider: (done) => done(null, tokens.access_token) });
}

export function storeMicrosoftTokens(tokens: StoredTokens) {
  return encryptSecret(JSON.stringify(tokens));
}
