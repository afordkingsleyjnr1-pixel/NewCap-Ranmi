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

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const settings = await getAppSettings();
  return NextResponse.json({
    followUpThresholdDays: settings.followUpThresholdDays,
    hunterKeyConfigured: !!settings.hunterApiKeyEncrypted || isHunterConfigured(),
    integrations: {
      anthropic: isAnthropicConfigured(),
      hunter: isHunterConfigured(),
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
  const data: Record<string, unknown> = {};
  if ("followUpThresholdDays" in body) data.followUpThresholdDays = body.followUpThresholdDays;
  if (body.hunterApiKey) data.hunterApiKeyEncrypted = encryptSecret(body.hunterApiKey);

  await prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  return NextResponse.json({ ok: true });
}
