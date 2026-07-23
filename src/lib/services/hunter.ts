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
  errors?: Array<{ id?: string; code?: number; details?: string }>;
}

interface DomainSearchResponse {
  data?: {
    pattern?: string;
    emails?: Array<{ value: string; confidence: number }>;
  };
  errors?: Array<{ id?: string; code?: number; details?: string }>;
}

interface VerifierResponse {
  data?: { status?: string; score?: number };
  errors?: Array<{ id?: string; code?: number; details?: string }>;
}

/** Hunter expects a bare domain ("example.com") — strips protocol, "www.", path, and query if the AI-resolved domain included any of them. */
function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split("?")[0]
    .toLowerCase();
}

/** Hunter returns 2xx with a top-level `errors` array (not an HTTP error) on invalid key, no credits, rate limits, etc. — surface it instead of silently treating it as "no match found". */
function hunterErrorMessage(res: Response, json: { errors?: Array<{ code?: number; details?: string }> }): string | null {
  if (res.ok && !json.errors?.length) return null;
  const detail = json.errors?.[0]?.details ?? json.errors?.[0]?.code ?? res.statusText;
  return `Hunter.io error (HTTP ${res.status}): ${detail}`;
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
  const domain = normalizeDomain(params.domain);

  const finderUrl = new URL(`${HUNTER_BASE}/email-finder`);
  finderUrl.searchParams.set("domain", domain);
  finderUrl.searchParams.set("first_name", params.firstName);
  finderUrl.searchParams.set("last_name", params.lastName);
  finderUrl.searchParams.set("api_key", apiKey);

  const finderRes = await fetch(finderUrl.toString());
  const finderJson: EmailFinderResponse = await finderRes.json();
  const finderError = hunterErrorMessage(finderRes, finderJson);
  if (finderError) throw new Error(finderError);

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
  domainUrl.searchParams.set("domain", domain);
  domainUrl.searchParams.set("api_key", apiKey);

  const domainRes = await fetch(domainUrl.toString());
  const domainJson: DomainSearchResponse = await domainRes.json();
  const domainError = hunterErrorMessage(domainRes, domainJson);
  if (domainError) throw new Error(domainError);

  if (domainJson.data?.pattern) {
    const constructed = applyNamePattern(domainJson.data.pattern, params.firstName, params.lastName, domain);
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
  const error = hunterErrorMessage(res, json);
  if (error) throw new Error(error);
  return { status: json.data?.status ?? null, score: json.data?.score ?? null };
}
