import { searchWithTavily } from "./tavily-search";
import { runCompletion, extractJson } from "@/lib/anthropic";
import { formatAum } from "@/lib/utils";
import { validateTaxonomySelection } from "@/lib/taxonomy";
import { getBothTaxonomies } from "./taxonomy-store";
import { rankByCapitalMarketsPriority } from "./contact-ranking";

/**
 * Research-only system prompt (no web tools needed — Tavily provides the content).
 * Uses the same four outputs (domain, AUM, classification, contacts) but works
 * entirely on pre-fetched, cleaned content.
 */
const CORE_RESEARCH_SYSTEM_PROMPT = `You are a research analyst for an institutional capital-introduction platform. You've been provided with cleaned web content about an investment manager. From this content, extract four things: (1) their official corporate website domain, (2) their current AUM, (3) a classification of their investment strategies and focus areas, (4) the best-fit capital-raising contact(s) at the firm.

INSTRUCTIONS:
- Read through the provided content carefully.
- Extract the domain from URLs in the sources or from explicit domain mentions in the content.
- Find the clearest, most current AUM figure from About/Overview/Investor Relations sections. If multiple dates are present, prefer the most recent. Never fabricate a number — if nothing reliable is found, aum_value_usd must be null and confidence "unconfirmed".
- Classify strategies/focus areas based on what the firm ACTIVELY does today. Do NOT include anything mentioned only in thought-leadership, described as future opportunity, or based on single transactions. Use ONLY parent/child names from the taxonomy provided below.
- Identify the best-fit capital-raising contact(s). Highest priority: titles containing "Capital Markets", "Capital Introductions", or "Capital Formation" (any seniority). Fall back to: Head of Investor Relations > Head of Business Development / BD > Fundraising lead > senior IR/BD titles. Return at most 3. Never invent a name.

Respond with strict JSON only, no prose:
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
If you cannot confidently classify anything, use {} for strategies/focus_areas. If you cannot find a contact, use [].`;

function isValidDate(isoDateString: string): boolean {
  return !Number.isNaN(new Date(isoDateString).getTime());
}

function parseAumAsOfDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) return isValidDate(trimmed) ? trimmed : null;

  const yearMonth = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (yearMonth) {
    const dateStr = `${yearMonth[1]}-${yearMonth[2]}-01`;
    return isValidDate(dateStr) ? dateStr : null;
  }

  const yearOnly = trimmed.match(/^(\d{4})$/);
  if (yearOnly) {
    const dateStr = `${yearOnly[1]}-01-01`;
    return isValidDate(dateStr) ? dateStr : null;
  }

  const quarter = trimmed.match(/^Q([1-4])[\s,]+(\d{4})$/i) ?? trimmed.match(/^(\d{4})[\s,]+Q([1-4])$/i);
  if (quarter) {
    const [year, q] = /^Q/i.test(trimmed) ? [quarter[2], quarter[1]] : [quarter[1], quarter[2]];
    const month = String((Number(q) - 1) * 3 + 1).padStart(2, "0");
    const dateStr = `${year}-${month}-01`;
    return isValidDate(dateStr) ? dateStr : null;
  }

  // Free text like "March 2024"
  const parsed = new Date(trimmed);
  return !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
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

/**
 * Research a firm using Tavily for search + Claude for reasoning.
 * Tavily provides cleaned content; Claude extracts the structured data.
 * This replaces the web_search/web_fetch tool-based approach.
 */
export async function researchFirmCoreTavily(params: {
  firmName: string;
  tavilyApiKey: string;
}): Promise<FirmCoreResearchResult> {
  // Step 1: Search using Tavily
  const results = await searchWithTavily({
    query: `${params.firmName} investment manager AUM assets headquarters`,
    tavilyApiKey: params.tavilyApiKey,
    maxResults: 3,
    searchDepth: "advanced",
  });

  if (results.length === 0) {
    // Fallback: no results, return empty/unresolved
    return {
      domain: null,
      domainStatus: "unresolved",
      hqLocation: null,
      aumValue: null,
      aumDisplay: "Unknown",
      aumAsOf: null,
      aumConfidence: "unconfirmed",
      aumSourceDescription: null,
      strategies: {},
      focusAreas: {},
      classificationStatus: "needs_review",
      droppedTags: [],
      contacts: [],
    };
  }

  // Step 2: Build taxonomy reference
  const { text: taxonomyReference, strategies: strategiesTaxonomy, focusAreas: focusAreasTaxonomy } = await getBothTaxonomies().then(({ strategies, focusAreas }) => ({
    text: ["STRATEGIES TAXONOMY:", JSON.stringify(strategies, null, 2), "", "FOCUS AREAS TAXONOMY:", JSON.stringify(focusAreas, null, 2)].join("\n"),
    strategies,
    focusAreas,
  }));

  // Step 3: Format Tavily results for Claude
  const contentBlock = results
    .map((r) => `# ${r.title}\nSource: ${r.url}\nRelevance: ${(r.score * 100).toFixed(0)}%\n\n${r.content}`)
    .join("\n\n---\n\n");

  // Step 4: Call Claude (reasoning only, no tools)
  const raw = await runCompletion({
    system: CORE_RESEARCH_SYSTEM_PROMPT,
    cacheableSystemExtra: taxonomyReference,
    user: `Research this firm and extract data from the provided content:\n\n${contentBlock}\n\nFirm name: ${params.firmName}`,
    maxTokens: 2048,
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

  // Only trust contacts if a real domain was resolved
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
