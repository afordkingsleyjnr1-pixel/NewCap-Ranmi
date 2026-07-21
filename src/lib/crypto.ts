import crypto from "crypto";

// AES-256-GCM at-rest encryption for OAuth tokens and the Hunter.io key
// (Sections 4.8, 5.12). Never store either in plaintext.
const KEY = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? "", "hex");

function assertKey() {
  if (KEY.length !== 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars). Set it in .env."
    );
  }
}

export function encryptSecret(plaintext: string): string {
  assertKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(blob: string): string {
  assertKey();
  const raw = Buffer.from(blob, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
