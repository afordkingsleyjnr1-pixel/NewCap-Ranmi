import { prisma } from "@/lib/db";
import { runWebResearch, extractJson } from "@/lib/anthropic";
import { STRATEGIES_TAXONOMY, FOCUS_AREAS_TAXONOMY, validateTaxonomySelection } from "@/lib/taxonomy";

// Section 5.4 — verbatim system prompt used by the Classification Engine.
const CLASSIFICATION_SYSTEM_PROMPT = `You are an Institutional Investment Manager Classification Engine. Your purpose is to analyze investment managers and populate a structured database with consistent, standardized classifications. The objective is not to copy marketing language from a firm's website, but to interpret what the firm actually does and map it into the predefined taxonomy below. The database will be used as a professional institutional manager sourcing platform, so consistency and accuracy are more important than maximizing the number of tags.

General Principles. When analyzing a manager, read the entire website, including: About, Investment Strategy, Investment Approach, Portfolio, Sectors, Industries, Capabilities, Funds, Platform, Lending, Credit, Real Estate, Infrastructure, Team, Investor Relations, News, Transactions, Case Studies, Portfolio Companies. Determine what the firm invests in, how the firm invests, which sectors it specializes in, geographic focus, typical investment size, asset classes, and types of capital deployed. Never invent classifications. Normalize marketing language into the taxonomy below. A firm may belong to multiple parent groups. A firm may have multiple child strategies under each parent group. Consistency is more important than using the firm's own terminology.

Scope of Classification (Critical Rule). The database must classify only what the firm actively does today, not everything it mentions, has knowledge of, or could potentially invest in. Every strategy and focus area assigned must represent an active part of the firm's investment platform.

Include only if: the firm currently invests in that strategy; the firm currently lends into that strategy; the firm currently manages a dedicated fund; the firm has an established investment platform; the strategy is explicitly listed as an investment capability; multiple transactions demonstrate the strategy; multiple portfolio companies support the classification; case studies clearly demonstrate the activity.

Do NOT include if: mentioned in a thought leadership article; mentioned in industry commentary; described as a future opportunity; the firm merely advises clients; one isolated transaction exists; the capability belongs to a portfolio company rather than the manager; the firm is "exploring" the area; the website simply references the sector.

Golden Rule. Only classify what the firm actively invests in, lends against, develops, owns, acquires, finances, or manages today. If the strategy or focus area is not an active part of the firm's investment platform, it must not appear in the database. This rule overrides all others.

Respond with strict JSON only, no prose, shaped exactly as:
{"strategies": {"Parent Group": ["Child Strategy", ...]}, "focus_areas": {"Parent Group": ["Child Focus Area", ...]}}
Use ONLY parent/child names that exist in the taxonomy provided in the user message. If you cannot confidently classify anything, return {"strategies": {}, "focus_areas": {}}.`;

function buildTaxonomyReference(): string {
  return [
    "STRATEGIES TAXONOMY:",
    JSON.stringify(STRATEGIES_TAXONOMY, null, 2),
    "",
    "FOCUS AREAS TAXONOMY:",
    JSON.stringify(FOCUS_AREAS_TAXONOMY, null, 2),
  ].join("\n");
}

export interface ClassificationResult {
  strategies: Record<string, string[]>;
  focusAreas: Record<string, string[]>;
  status: "classified" | "needs_review";
  droppedTags: string[];
  raw: string;
}

/**
 * Runs the shared classification pipeline for a firm. Called from both
 * Add Firm (5.1) and Populate (5.10) — one engine, two entry points.
 */
export async function classifyFirm(params: {
  firmName: string;
  domain: string | null;
  strategyDetail: string | null;
}): Promise<ClassificationResult> {
  const userMessage = [
    buildTaxonomyReference(),
    "",
    `Classify this investment manager: ${params.firmName}`,
    params.domain ? `Website domain: ${params.domain}` : "No known website domain — search to find it first.",
    params.strategyDetail ? `\nExisting research notes on file:\n${params.strategyDetail}` : "",
    "\nSearch the firm's website (About, Investment Strategy, Portfolio, Funds, Team, Investor Relations, News, Transactions pages) and respond with the strict JSON classification only.",
  ].join("\n");

  const raw = await runWebResearch({ system: CLASSIFICATION_SYSTEM_PROMPT, user: userMessage, maxTokens: 2048 });
  const parsed = extractJson<{ strategies?: unknown; focus_areas?: unknown }>(raw);

  const stratResult = validateTaxonomySelection(parsed?.strategies, STRATEGIES_TAXONOMY);
  const focusResult = validateTaxonomySelection(parsed?.focus_areas, FOCUS_AREAS_TAXONOMY);

  const hasAny = Object.keys(stratResult.valid).length > 0 || Object.keys(focusResult.valid).length > 0;

  return {
    strategies: stratResult.valid,
    focusAreas: focusResult.valid,
    status: hasAny ? "classified" : "needs_review",
    droppedTags: [...stratResult.dropped, ...focusResult.dropped],
    raw,
  };
}

/**
 * Writes a classification result to a firm, respecting manual overrides
 * (Section 5.4: Reclassify never overwrites a manually-edited tag) and
 * clearing research_sources for any tag that no longer exists.
 */
export async function applyClassification(
  firmId: string,
  result: ClassificationResult,
  opts: { isReclassify?: boolean } = {}
) {
  const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId } });

  let nextStrategies = result.strategies;
  let nextFocusAreas = result.focusAreas;

  if (opts.isReclassify && firm.classificationSource !== "engine") {
    // Manual/edited firm: only fill in parents the user hasn't touched — never
    // overwrite an existing parent's children.
    const existingStrategies = (firm.strategies as Record<string, string[]>) ?? {};
    const existingFocusAreas = (firm.focusAreas as Record<string, string[]>) ?? {};
    nextStrategies = { ...result.strategies, ...existingStrategies };
    nextFocusAreas = { ...result.focusAreas, ...existingFocusAreas };
  }

  await prisma.firm.update({
    where: { id: firmId },
    data: {
      strategies: nextStrategies,
      focusAreas: nextFocusAreas,
      classificationStatus: result.status,
      classificationSource: opts.isReclassify && firm.classificationSource !== "engine" ? firm.classificationSource : "engine",
      classifiedAt: new Date(),
    },
  });

  // Drop research_sources rows for tags that no longer exist.
  const allValidTags = new Set<string>();
  for (const [parent, children] of Object.entries(nextStrategies)) {
    for (const child of children) allValidTags.add(`strategies.${parent}.${child}`);
  }
  for (const [parent, children] of Object.entries(nextFocusAreas)) {
    for (const child of children) allValidTags.add(`focus_areas.${parent}.${child}`);
  }

  const existingSources = await prisma.researchSource.findMany({
    where: { entityType: "firm", entityId: firmId, fieldName: { startsWith: "strategies." } },
  });
  const existingFocusSources = await prisma.researchSource.findMany({
    where: { entityType: "firm", entityId: firmId, fieldName: { startsWith: "focus_areas." } },
  });
  const staleIds = [...existingSources, ...existingFocusSources]
    .filter((s) => !allValidTags.has(s.fieldName))
    .map((s) => s.id);
  if (staleIds.length) {
    await prisma.researchSource.deleteMany({ where: { id: { in: staleIds } } });
  }
}
