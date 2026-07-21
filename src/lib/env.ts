function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const DATABASE_URL = getRequiredEnv("DATABASE_URL");
export const AUTH_SECRET = getRequiredEnv("AUTH_SECRET");
export const TOKEN_ENCRYPTION_KEY = getRequiredEnv("TOKEN_ENCRYPTION_KEY");

export const ANTHROPIC_API_KEY = getOptionalEnv("ANTHROPIC_API_KEY");
export const HUNTER_API_KEY = getOptionalEnv("HUNTER_API_KEY");

export const GOOGLE_CLIENT_ID = getOptionalEnv("GOOGLE_CLIENT_ID");
export const GOOGLE_CLIENT_SECRET = getOptionalEnv("GOOGLE_CLIENT_SECRET");
export const GOOGLE_REDIRECT_URI = getOptionalEnv("GOOGLE_REDIRECT_URI");

export const MICROSOFT_CLIENT_ID = getOptionalEnv("MICROSOFT_CLIENT_ID");
export const MICROSOFT_CLIENT_SECRET = getOptionalEnv("MICROSOFT_CLIENT_SECRET");
export const MICROSOFT_REDIRECT_URI = getOptionalEnv("MICROSOFT_REDIRECT_URI");
export const MICROSOFT_TENANT_ID = getOptionalEnv("MICROSOFT_TENANT_ID");

export const CRON_SECRET = getOptionalEnv("CRON_SECRET");
export const NODE_ENV = getOptionalEnv("NODE_ENV") ?? "development";

export function isProduction(): boolean {
  return NODE_ENV === "production";
}
