import { runWebResearch, extractJson } from "@/lib/anthropic";
import { formatAum } from "@/lib/utils";
import { STRATEGIES_TAXONOMY, FOCUS_AREAS_TAXONOMY, validateTaxonomySelection } from "@/lib/taxonomy";

// Cost lever: domain resolution, AUM research, and classification used to be
// three separate Claude calls, each with its own web_search budget and its
// own system-prompt overhead. They're combined into one call here — one
// shared search budget, one round of page reads — since all three need the
// same web presence for the same firm anyway. Reclassify-only call sites
// keep using classification-engine.ts's standalone classifyFirm() since they
// already have a domain and don't need to re-resolve it.
const CORE_RESEARCH_SYSTEM_PROMPT = `You are a research analyst for an institutional manager sourcing platform. For the given investment manager, do ONE round of web research covering three things at once: (1) their official corporate website domain, (2) their current AUM, (3) a classification of their investment strategies and focus areas.

1. DOMAIN: Search the web and identify the single, correct, official domain. Never guess a plausible-looking domain when you are not confident — return status "ambiguous" (multiple similarly-named firms) or "unresolved" (no clear web presence) instead of "resolved".

2. AUM: Once you know their site, find the clearest, most current AUM figure from their About/Overview/Investment Strategy/Investor Relations pages or other reliable sources. Never fabricate a number — if nothing reliable is found, aum_value_usd must be null and confidence "unconfirmed".

3. CLASSIFICATION: Read the firm's site (About, Investment Strategy, Investment Approach, Portfolio, Sectors, Industries, Capabilities, Funds, Platform, Lending, Credit, Real Estate, Infrastructure, Team, Investor Relations, News, Transactions, Case Studies, Portfolio Companies) and map what they actually do — not marketing language — onto the taxonomy provided below. Classify only what the firm ACTIVELY does today: currently invests in, currently lends into, has a dedicated fund or established platform for, or is demonstrated by multiple transactions/portfolio companies/case studies. Do NOT include something mentioned only in thought-leadership content, described as a future opportunity, based on one isolated transaction, or belonging to a portfolio company rather than the manager itself. This rule overrides all others. Use ONLY parent/child names from the taxonomy — never invent one.

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
  "focus_areas": {"Parent Group": ["Child Focus Area", ...]}
}
If you cannot confidently classify anything, use {} for strategies/focus_areas rather than guessing.`;

function buildTaxonomyReference(): string {
  return ["STRATEGIES TAXONOMY:", JSON.stringify(STRATEGIES_TAXONOMY, null, 2), "", "FOCUS AREAS TAXONOMY:", JSON.stringify(FOCUS_AREAS_TAXONOMY, null, 2)].join(
    "\n"
  );
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
}

export async function researchFirmCore(params: { firmName: string }): Promise<FirmCoreResearchResult> {
  const userMessage = [buildTaxonomyReference(), "", `Research and classify this investment manager: ${params.firmName}`].join("\n");

  const raw = await runWebResearch({ system: CORE_RESEARCH_SYSTEM_PROMPT, user: userMessage, maxTokens: 2560, maxUses: 6 });
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
  }>(raw);

  const domainStatus =
    parsed?.domain_status === "resolved" || parsed?.domain_status === "ambiguous" || parsed?.domain_status === "unresolved"
      ? parsed.domain_status
      : "unresolved";

  const aumValue = typeof parsed?.aum_value_usd === "number" ? parsed.aum_value_usd : null;
  const aumConfidence = parsed?.aum_confidence === "confirmed" || parsed?.aum_confidence === "dated" ? parsed.aum_confidence : "unconfirmed";

  const stratResult = validateTaxonomySelection(parsed?.strategies, STRATEGIES_TAXONOMY);
  const focusResult = validateTaxonomySelection(parsed?.focus_areas, FOCUS_AREAS_TAXONOMY);
  const hasAnyClassification = Object.keys(stratResult.valid).length > 0 || Object.keys(focusResult.valid).length > 0;

  return {
    domain: domainStatus === "resolved" ? parsed?.domain ?? null : null,
    domainStatus,
    hqLocation: parsed?.hq_location ?? null,
    aumValue,
    aumDisplay: formatAum(aumValue, aumConfidence),
    aumAsOf: parsed?.aum_as_of_date ?? null,
    aumConfidence,
    aumSourceDescription: parsed?.aum_source_description ?? null,
    strategies: stratResult.valid,
    focusAreas: focusResult.valid,
    classificationStatus: hasAnyClassification ? "classified" : "needs_review",
    droppedTags: [...stratResult.dropped, ...focusResult.dropped],
  };
}
