import crypto from "crypto";
import { prisma } from "@/lib/db";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-dev-key-change-in-production";
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32)), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text: string): string {
  const parts = text.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32)), iv);
  let decrypted = decipher.update(parts[1], "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Get decrypted Tavily API key from settings, or null if not set.
 */
export async function getTavilyApiKey(): Promise<string | null> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!settings?.tavilyApiKeyEncrypted) return null;
  try {
    return decrypt(settings.tavilyApiKeyEncrypted);
  } catch {
    return null;
  }
}

/**
 * Set encrypted Tavily API key in settings.
 */
export async function setTavilyApiKey(apiKey: string): Promise<void> {
  const encrypted = encrypt(apiKey);
  await prisma.appSettings.upsert({
    where: { id: 1 },
    create: { id: 1, tavilyApiKeyEncrypted: encrypted },
    update: { tavilyApiKeyEncrypted: encrypted },
  });
}

/**
 * Get decrypted Hunter API key from settings, or null if not set.
 */
export async function getHunterApiKey(): Promise<string | null> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!settings?.hunterApiKeyEncrypted) return null;
  try {
    return decrypt(settings.hunterApiKeyEncrypted);
  } catch {
    return null;
  }
}

/**
 * Set encrypted Hunter API key in settings.
 */
export async function setHunterApiKey(apiKey: string): Promise<void> {
  const encrypted = encrypt(apiKey);
  await prisma.appSettings.upsert({
    where: { id: 1 },
    create: { id: 1, hunterApiKeyEncrypted: encrypted },
    update: { hunterApiKeyEncrypted: encrypted },
  });
}
