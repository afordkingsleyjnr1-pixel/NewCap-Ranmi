import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { getAppSettings } from "@/lib/services/app-settings";
import { encryptSecret } from "@/lib/crypto";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { isHunterConfigured } from "@/lib/services/hunter";
import { isGoogleConfigured } from "@/lib/services/google-oauth";
import { isMicrosoftConfigured } from "@/lib/services/microsoft-oauth";
import { getTavilyApiKey } from "@/lib/services/settings-encryption";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const settings = await getAppSettings();
  const hunterConfigured = await isHunterConfigured();
  const tavilyConfigured = !!(await getTavilyApiKey());
  return NextResponse.json({
    followUpThresholdDays: settings.followUpThresholdDays,
    hunterKeyConfigured: hunterConfigured,
    tavilyKeyConfigured: tavilyConfigured,
    integrations: {
      anthropic: isAnthropicConfigured(),
      hunter: hunterConfigured,
      tavily: tavilyConfigured,
      google: isGoogleConfigured(),
      microsoft: isMicrosoftConfigured(),
    },
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const body = await req.json();
  console.log("[settings/app PATCH] Received body keys:", Object.keys(body));
  const data: Record<string, unknown> = {};
  if ("followUpThresholdDays" in body) data.followUpThresholdDays = body.followUpThresholdDays;
  if (body.hunterApiKey) {
    console.log("[settings/app PATCH] Encrypting Hunter API key...");
    data.hunterApiKeyEncrypted = encryptSecret(body.hunterApiKey);
  }
  if (body.tavilyApiKey) {
    console.log("[settings/app PATCH] Encrypting Tavily API key, length:", body.tavilyApiKey.length);
    data.tavilyApiKeyEncrypted = encryptSecret(body.tavilyApiKey);
    console.log("[settings/app PATCH] Encrypted Tavily key length:", (data.tavilyApiKeyEncrypted as string).length);
  }

  console.log("[settings/app PATCH] Upserting AppSettings with keys:", Object.keys(data));
  const result = await prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  console.log("[settings/app PATCH] Upsert complete. Result:", result);
  return NextResponse.json({ ok: true });
}
