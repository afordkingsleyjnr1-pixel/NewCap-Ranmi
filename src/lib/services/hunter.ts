import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

// Section 5.5 — Hunter.io integration for email finding/verification. Server-side only.
const HUNTER_BASE = "https://api.hunter.io/v2";

/**
 * The key can come from either source: an env var (set once, applies to
 * every deployment) or the encrypted value saved via Settings → Account
 * Settings (Section 5.12). The env var wins if both are set.
 */
async function getHunterApiKey(): Promise<string | null> {
  if (process.env.HUNTER_API_KEY) return process.env.HUNTER_API_KEY;
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (settings?.hunterApiKeyEncrypted) {
    try {
      return decryptSecret(settings.hunterApiKeyEncrypted);
    } catch {
      return null;
    }
  }
  return null;
}

export async function isHunterConfigured(): Promise<boolean> {
  return (await getHunterApiKey()) !== null;
}

interface EmailFinderResponse {
  data?: {
    email?: string;
    score?: number;
    verification?: { status?: string };
  };
}

interface DomainSearchResponse {
  data?: {
    pattern?: string;
    emails?: Array<{ value: string; confidence: number }>;
  };
}

interface VerifierResponse {
  data?: { status?: string; score?: number };
}

export interface HunterEmailResult {
  email: string | null;
  status: "verified" | "inferred" | "unknown";
  source: string;
  deliverabilityScore: number | null;
}

function applyNamePattern(pattern: string, first: string, last: string, domain: string): string {
  const f = first.toLowerCase();
  const l = last.toLowerCase();
  return pattern
    .replace("{first}", f)
    .replace("{last}", l)
    .replace("{f}", f[0] ?? "")
    .replace("{l}", l[0] ?? "")
    .replace("{domain}", domain);
}

/**
 * Section 5.5 "Find email": Email Finder → Domain Search pattern fallback → optional Verifier.
 */
export async function findEmail(params: {
  domain: string;
  firstName: string;
  lastName: string;
}): Promise<HunterEmailResult> {
  const apiKey = await getHunterApiKey();
  if (!apiKey) {
    throw new Error("Hunter.io API key is not set. Add it in Settings → Account Settings to enable email enrichment.");
  }

  const finderUrl = new URL(`${HUNTER_BASE}/email-finder`);
  finderUrl.searchParams.set("domain", params.domain);
  finderUrl.searchParams.set("first_name", params.firstName);
  finderUrl.searchParams.set("last_name", params.lastName);
  finderUrl.searchParams.set("api_key", apiKey);

  const finderRes = await fetch(finderUrl.toString());
  const finderJson: EmailFinderResponse = await finderRes.json();

  if (finderJson.data?.email) {
    const verified = finderJson.data.verification?.status === "valid";
    const score = finderJson.data.score ?? null;
    let status: HunterEmailResult["status"] = "inferred";
    if (verified && (score ?? 0) >= 90) status = "verified";

    return {
      email: finderJson.data.email,
      status,
      source: "Hunter.io Email Finder",
      deliverabilityScore: score,
    };
  }

  // Fall back to Domain Search pattern + construct.
  const domainUrl = new URL(`${HUNTER_BASE}/domain-search`);
  domainUrl.searchParams.set("domain", params.domain);
  domainUrl.searchParams.set("api_key", apiKey);

  const domainRes = await fetch(domainUrl.toString());
  const domainJson: DomainSearchResponse = await domainRes.json();

  if (domainJson.data?.pattern) {
    const constructed = applyNamePattern(domainJson.data.pattern, params.firstName, params.lastName, params.domain);
    return {
      email: constructed,
      status: "inferred",
      source: `Hunter.io Domain Search — pattern-inferred: ${domainJson.data.pattern}`,
      deliverabilityScore: null,
    };
  }

  return { email: null, status: "unknown", source: "Hunter.io — no match found", deliverabilityScore: null };
}

export async function verifyEmail(email: string): Promise<{ status: string | null; score: number | null }> {
  const apiKey = await getHunterApiKey();
  if (!apiKey) throw new Error("Hunter.io API key is not set.");

  const url = new URL(`${HUNTER_BASE}/email-verifier`);
  url.searchParams.set("email", email);
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString());
  const json: VerifierResponse = await res.json();
  return { status: json.data?.status ?? null, score: json.data?.score ?? null };
}
