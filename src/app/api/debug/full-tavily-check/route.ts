import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTavilyApiKey } from "@/lib/services/settings-encryption";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

export async function GET() {
  try {
    const results: Record<string, any> = {};

    // 1. Check if AppSettings row exists
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    results.settingsRowExists = !!settings;
    results.tavilyApiKeyEncryptedField = settings?.tavilyApiKeyEncrypted ? "exists" : "null";

    // 2. Try the getTavilyApiKey function
    results.getTavilyApiKey = "attempting...";
    try {
      const key = await getTavilyApiKey();
      results.getTavilyApiKey = key ? `success (length: ${key.length})` : "returned null";
      results.keyValue = key;
    } catch (e) {
      results.getTavilyApiKey = `error: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 3. Test encryption/decryption roundtrip
    results.encryptionTest = "attempting...";
    try {
      const testValue = "test-tavily-key-12345";
      const encrypted = encryptSecret(testValue);
      const decrypted = decryptSecret(encrypted);
      results.encryptionTest = decrypted === testValue ? "success" : "mismatch";
    } catch (e) {
      results.encryptionTest = `error: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 4. Try to manually decrypt what's in the database
    if (settings?.tavilyApiKeyEncrypted) {
      results.manualDecrypt = "attempting...";
      try {
        const manualDecrypted = decryptSecret(settings.tavilyApiKeyEncrypted);
        results.manualDecrypt = `success (length: ${manualDecrypted.length})`;
        results.manualDecryptValue = manualDecrypted;
      } catch (e) {
        results.manualDecrypt = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else {
      results.manualDecrypt = "no encrypted value in database";
    }

    return NextResponse.json(results);
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      },
      { status: 500 }
    );
  }
}
