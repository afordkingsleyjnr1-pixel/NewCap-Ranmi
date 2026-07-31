import { runWebResearch, extractJson } from "@/lib/anthropic";
import { formatAum } from "@/lib/utils";
import { validateTaxonomySelection } from "@/lib/taxonomy";
import { getBothTaxonomies } from "./taxonomy-store";
import { rankByCapitalMarketsPriority } from "./contact-ranking";

// Cost lever: domain resolution, AUM research, classification, AND contact
// discovery used to be four separate Claude calls, each with its own
// web_search budget and its own system-prompt overhead. They're combined
// into one call here — one shared search budget, one round of page reads —
// since all four need the same web presence for the same firm anyway.
// Reclassify-only call sites keep using classification-engine.ts's
// standalone classifyFirm() since they already have a domain and don't need
// to re-resolve it or re-find contacts. The taxonomy block is passed as a
// separately cached system block (see cacheableSystemExtra in anthropic.ts)
// since it's byte-identical across every firm — no reason to pay for it on
// every single call.
const CORE_RESEARCH_SYSTEM_PROMPT = `You are a research analyst for an institutional capital-introduction platform. For the given investment manager, do ONE round of web research covering four things at once: (1) their official corporate website domain, (2) their current AUM, (3) a classification of their investment strategies and focus areas, (4) the best-fit capital-raising contact(s) at the firm.

RESEARCH METHOD: Use web_search sparingly — ideally just once — to resolve the official domain and identify which of the firm's own pages (About, Investment Strategy, Investor Relations, Team/Leadership, News) are likely to have the AUM figure, the classification detail, and the contact names. Then use web_fetch to retrieve those pages directly and read the full content, rather than running additional searches to piece the answer together from snippets. Fetching the actual page gives you complete, reliable text for AUM figures and contact names — trust it over search-result snippets.

1. DOMAIN: Search the web and identify the single, correct, official domain. Never guess a plausible-looking domain when you are not confident — return status "ambiguous" (multiple similarly-named firms) or "unresolved" (no clear web presence) instead of "resolved".

2. AUM: Once you know their site, find the clearest, most current AUM figure from their About/Overview/Investment Strategy/Investor Relations pages or other reliable sources. Never fabricate a number — if nothing reliable is found, aum_value_usd must be null and confidence "unconfirmed".

3. CLASSIFICATION: Read the firm's site (About, Investment Strategy, Investment Approach, Portfolio, Sectors, Industries, Capabilities, Funds, Platform, Lending, Credit, Real Estate, Infrastructure, Team, Investor Relations, News, Transactions, Case Studies, Portfolio Companies) and map what they actually do — not marketing language — onto the taxonomy provided below (given as a separate reference block). Classify only what the firm ACTIVELY does today: currently invests in, currently lends into, has a dedicated fund or established platform for, or is demonstrated by multiple transactions/portfolio companies/case studies. Do NOT include something mentioned only in thought-leadership content, described as a future opportunity, based on one isolated transaction, or belonging to a portfolio company rather than the manager itself. This rule overrides all others. Use ONLY parent/child names from the taxonomy — never invent one.

4. CONTACTS: Identify the best-fit capital-raising contact(s) at the firm, only if you found a real official domain for them. The single highest priority: find anyone whose title contains the words "Capital Markets", "Capital Introductions", or "Capital Formation" — at ANY seniority level (Analyst, Associate, VP, Director, Head, Managing Director, Partner, etc. all count equally). A "Director of Capital Markets" outranks a "Head of Investor Relations" who has none of those three phrases in their title. Only if nobody at the firm has one of those three phrases, fall back to the next-best capital-raising contact: Head of Investor Relations > Head of Business Development / BD > Fundraising lead > any senior IR/BD-adjacent title. Include alternate/secondary contacts after the primary one if you find other people doing the same kind of work. Return at most 3. Never invent a name — if none can be found confidently, return an empty array.

Respond with strict JSON only, no prose, shaped exactly as:
{
  "domain": "<domain.com or null>",
  "domain_status": "resolved" | "ambiguous" | "unresolved",
  "hq_location": "<city, state/country or null>",
  "aum_value_usd": <number or null>,
  "aum_as_of_date": "<YYYY-MM-DD or null>",
  "aum_confidence": "confirmed" | "dated" | "unconfirmed",
  "aum_source_description": "<page/section cited or null>",
  "strategies": {"Parent Group": ["Child Strategy", ...]},
  "focus_areas": {"Parent Group": ["Child Focus Area", ...]},
  "contacts": [{"name": "...", "title": "...", "linkedin_url": "... or null", "source_description": "...", "rank": 1}]
}
If you cannot confidently classify anything, use {} for strategies/focus_areas rather than guessing. If you cannot confidently find a contact, use [] rather than guessing.`;

// The prompt asks for strict YYYY-MM-DD, but sources (and the model) often
// only give a coarser date — "Q1 2025", "March 2024", just "2024" — and an
// unparseable string like "recent" must never reach `new Date(...)`, since
// that doesn't throw, it silently produces an Invalid Date that only fails
// once Prisma tries to write it, aborting the whole firm add. Rather than
// discarding every non-exact format down to null, normalize the common
// coarser shapes to a real calendar date (first day of the
// quarter/month/year) so a genuine "as of Q1 2025" from a source still
// gets recorded — only truly unparseable text becomes null.
function parseAumAsOfDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) return isValidDate(trimmed) ? trimmed : null;

  const yearMonth = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (yearMonth) return normalize(`${yearMonth[1]}-${yearMonth[2]}-01`);

  const yearOnly = trimmed.match(/^(\d{4})$/);
  if (yearOnly) return normalize(`${yearOnly[1]}-01-01`);

  const quarter = trimmed.match(/^Q([1-4])[\s,]+(\d{4})$/i) ?? trimmed.match(/^(\d{4})[\s,]+Q([1-4])$/i);
  if (quarter) {
    const [year, q] = /^Q/i.test(trimmed) ? [quarter[2], quarter[1]] : [quarter[1], quarter[2]];
    const month = String((Number(q) - 1) * 3 + 1).padStart(2, "0");
    return normalize(`${year}-${month}-01`);
  }

  // Free text like "March 2024" or "31 December 2023" — trust JS's date
  // parser but always verify the result before returning it.
  const parsed = new Date(trimmed);
  return isValidDateObject(parsed) ? parsed.toISOString().slice(0, 10) : null;
}

function isValidDate(isoDateString: string): boolean {
  return isValidDateObject(new Date(isoDateString));
}

function isValidDateObject(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

function normalize(isoDateString: string): string | null {
  return isValidDate(isoDateString) ? isoDateString : null;
}

async function buildTaxonomyReference(): Promise<{ text: string; strategies: Record<string, string[]>; focusAreas: Record<string, string[]> }> {
  const { strategies, focusAreas } = await getBothTaxonomies();
  const text = ["STRATEGIES TAXONOMY:", JSON.stringify(strategies, null, 2), "", "FOCUS AREAS TAXONOMY:", JSON.stringify(focusAreas, null, 2)].join("\n");
  return { text, strategies, focusAreas };
}

export interface CoreResearchContact {
  name: string;
  title: string | null;
  linkedinUrl: string | null;
  sourceDescription: string | null;
  rank: number;
}

export interface FirmCoreResearchResult {
  domain: string | null;
  domainStatus: "resolved" | "ambiguous" | "unresolved";
  hqLocation: string | null;
  aumValue: number | null;
  aumDisplay: string;
  aumAsOf: string | null;
  aumConfidence: "confirmed" | "dated" | "unconfirmed";
  aumSourceDescription: string | null;
  strategies: Record<string, string[]>;
  focusAreas: Record<string, string[]>;
  classificationStatus: "classified" | "needs_review";
  droppedTags: string[];
  contacts: CoreResearchContact[];
}

export async function researchFirmCore(params: { firmName: string }): Promise<FirmCoreResearchResult> {
  const { text: taxonomyReference, strategies: strategiesTaxonomy, focusAreas: focusAreasTaxonomy } = await buildTaxonomyReference();

  const raw = await runWebResearch({
    system: CORE_RESEARCH_SYSTEM_PROMPT,
    cacheableSystemExtra: taxonomyReference,
    user: `Research and classify this investment manager: ${params.firmName}`,
    maxTokens: 3072,
    maxUses: 1,
    maxFetches: 2,
  });
  const parsed = extractJson<{
    domain?: string | null;
    domain_status?: string;
    hq_location?: string | null;
    aum_value_usd?: number | null;
    aum_as_of_date?: string | null;
    aum_confidence?: string;
    aum_source_description?: string | null;
    strategies?: unknown;
    focus_areas?: unknown;
    contacts?: Array<{ name?: string; title?: string; linkedin_url?: string; source_description?: string; rank?: number }>;
  }>(raw);

  const domainStatus =
    parsed?.domain_status === "resolved" || parsed?.domain_status === "ambiguous" || parsed?.domain_status === "unresolved"
      ? parsed.domain_status
      : "unresolved";

  const aumValue = typeof parsed?.aum_value_usd === "number" ? parsed.aum_value_usd : null;
  const aumConfidence = parsed?.aum_confidence === "confirmed" || parsed?.aum_confidence === "dated" ? parsed.aum_confidence : "unconfirmed";

  const stratResult = validateTaxonomySelection(parsed?.strategies, strategiesTaxonomy);
  const focusResult = validateTaxonomySelection(parsed?.focus_areas, focusAreasTaxonomy);
  const hasAnyClassification = Object.keys(stratResult.valid).length > 0 || Object.keys(focusResult.valid).length > 0;

  // Contacts are only trustworthy if a real domain was resolved — discard
  // anything the model returned otherwise rather than risk a hallucinated name.
  let contacts: CoreResearchContact[] = [];
  if (domainStatus === "resolved" && Array.isArray(parsed?.contacts)) {
    const mapped = parsed.contacts
      .filter((c) => typeof c.name === "string" && c.name.trim().length > 0)
      .map((c, i) => ({
        name: c.name!.trim(),
        title: c.title ?? null,
        linkedinUrl: c.linkedin_url ?? null,
        sourceDescription: c.source_description ?? null,
        rank: typeof c.rank === "number" ? c.rank : i + 1,
      }))
      .sort((a, b) => a.rank - b.rank);
    contacts = rankByCapitalMarketsPriority(mapped).map((c, i) => ({ ...c, rank: i + 1 }));
  }

  return {
    domain: domainStatus === "resolved" ? parsed?.domain ?? null : null,
    domainStatus,
    hqLocation: parsed?.hq_location ?? null,
    aumValue,
    aumDisplay: formatAum(aumValue, aumConfidence),
    aumAsOf: parseAumAsOfDate(parsed?.aum_as_of_date),
    aumConfidence,
    aumSourceDescription: parsed?.aum_source_description ?? null,
    strategies: stratResult.valid,
    focusAreas: focusResult.valid,
    classificationStatus: hasAnyClassification ? "classified" : "needs_review",
    droppedTags: [...stratResult.dropped, ...focusResult.dropped],
    contacts,
  };
}
