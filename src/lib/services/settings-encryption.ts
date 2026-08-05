import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

/**
 * Get decrypted Tavily API key from settings, or null if not set.
 * Uses the standard project encryption (TOKEN_ENCRYPTION_KEY).
 */
export async function getTavilyApiKey(): Promise<string | null> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!settings?.tavilyApiKeyEncrypted) return null;
  try {
    return decryptSecret(settings.tavilyApiKeyEncrypted);
  } catch (e) {
    console.error("Failed to decrypt Tavily API key:", e);
    return null;
  }
}

/**
 * Get decrypted Hunter API key from settings, or null if not set.
 * Uses the standard project encryption (TOKEN_ENCRYPTION_KEY).
 */
export async function getHunterApiKey(): Promise<string | null> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!settings?.hunterApiKeyEncrypted) return null;
  try {
    return decryptSecret(settings.hunterApiKeyEncrypted);
  } catch (e) {
    console.error("Failed to decrypt Hunter API key:", e);
    return null;
  }
}
