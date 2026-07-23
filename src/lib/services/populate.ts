import { prisma } from "@/lib/db";
import { runWebResearch, extractJson, isAnthropicConfigured } from "@/lib/anthropic";
import { findDuplicate } from "./dedupe";
import { runFirmResearchPipeline } from "./firm-pipeline";
import type { PopulateMode } from "@/generated/prisma";

function candidateSearchPrompt(desiredCount: number, exclude?: string[]): string {
  const excludeLine = exclude?.length ? `\nDo not repeat any of these already-found firms: ${exclude.join(", ")}.` : "";
  return `You are a manager-sourcing research analyst for an institutional capital-introduction platform. Given a search brief describing an investment strategy, focus area, geography, and AUM band, find real institutional investment managers that plausibly match ALL of the criteria.

Respond with strict JSON only:
{"candidates": ["Firm Name 1", "Firm Name 2", ...]}
Return up to ${desiredCount} real, currently-operating firm names. Never invent a firm. If you cannot find confident matches, return an empty array.${excludeLine}`;
}

// Cost/runaway-spend guards. Without these, "Populate the whole database"
// runs one search call per EXISTING firm (cost scales with database size,
// not with what you're actually looking for), and any Populate run could
// silently add and fully research dozens of firms from one click. Both are
// capped here rather than left to trust the model's own restraint.
const MAX_DATABASE_WIDE_BRIEFS = 10;
const MAX_FIRMS_ADDED_PER_RUN = 20;
// User-facing "Number of firms" input (By Strategy & Focus Area mode) is
// clamped to this range — floor keeps a run meaningful, ceiling keeps a
// single click from triggering a very large research bill.
const MIN_TARGET_COUNT = 1;
const MAX_TARGET_COUNT = 50;
// Extra candidate-search rounds attempted when the first pass comes up
// short of the requested count, before settling for however many were found.
const MAX_SEARCH_ROUNDS = 3;

interface SearchBrief {
  strategies?: Record<string, string[]>;
  focusAreas?: Record<string, string[]>;
  geography?: string | null;
  aumBand?: { min?: number; max?: number } | null;
  targetMarkets?: string[];
}

function briefToPrompt(brief: SearchBrief): string {
  const lines: string[] = [];
  if (brief.strategies && Object.keys(brief.strategies).length) {
    lines.push(`Strategies: ${JSON.stringify(brief.strategies)}`);
  }
  if (brief.focusAreas && Object.keys(brief.focusAreas).length) {
    lines.push(`Focus Areas: ${JSON.stringify(brief.focusAreas)}`);
  }
  if (brief.geography) lines.push(`Geography / target markets: ${brief.geography}`);
  if (brief.targetMarkets?.length) lines.push(`Target markets: ${brief.targetMarkets.join(", ")}`);
  if (brief.aumBand?.min || brief.aumBand?.max) {
    lines.push(`AUM band: $${brief.aumBand.min ?? 0} - $${brief.aumBand.max ?? "unbounded"}`);
  }
  return lines.join("\n");
}

async function searchCandidates(brief: SearchBrief, desiredCount: number, exclude?: string[]): Promise<string[]> {
  const raw = await runWebResearch({
    system: candidateSearchPrompt(desiredCount, exclude),
    user: briefToPrompt(brief),
    maxTokens: 1024,
    maxUses: 4,
  });
  const parsed = extractJson<{ candidates?: string[] }>(raw);
  return Array.isArray(parsed?.candidates) ? parsed.candidates.filter((c) => typeof c === "string") : [];
}

export interface PopulateResult {
  runId: string;
  firmsFound: number;
  firmsAdded: number;
  firmsSkippedDuplicate: number;
  addedFirms: { id: string; name: string }[];
  researchWarnings: string[];
}

export async function runPopulate(params: {
  mode: PopulateMode;
  seedFirmId?: string;
  criteria?: SearchBrief;
  /** "Number of firms" the user asked for (By Strategy & Focus Area mode only). Clamped to [1, 50]; other modes ignore this and keep the flat 20-per-run cap. */
  targetCount?: number;
  triggeredById: string;
  onProgress?: (message: string) => void;
}): Promise<PopulateResult> {
  const emit = params.onProgress ?? (() => {});
  if (!isAnthropicConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not set. Populate requires the Classification/Research engine to be configured.");
  }

  const maxFirmsToAdd =
    params.mode === "by_criteria" && params.targetCount
      ? Math.min(MAX_TARGET_COUNT, Math.max(MIN_TARGET_COUNT, Math.round(params.targetCount)))
      : MAX_FIRMS_ADDED_PER_RUN;

  const run = await prisma.populateRun.create({
    data: {
      mode: params.mode,
      seedFirmId: params.seedFirmId ?? null,
      criteria: params.criteria ? (params.criteria as object) : undefined,
      triggeredById: params.triggeredById,
    },
  });

  let briefs: SearchBrief[] = [];

  if (params.mode === "similar_to_firm") {
    const seed = await prisma.firm.findUniqueOrThrow({ where: { id: params.seedFirmId! } });
    briefs = [
      {
        strategies: seed.strategies as Record<string, string[]>,
        focusAreas: seed.focusAreas as Record<string, string[]>,
        geography: seed.hqLocation,
        targetMarkets: seed.targetMarkets,
        aumBand: seed.aumValue ? { min: Number(seed.aumValue) * 0.5, max: Number(seed.aumValue) * 2 } : null,
      },
    ];
  } else if (params.mode === "by_criteria") {
    briefs = [params.criteria!];
  } else {
    // Capped and ordered by most-recently-added — a bounded, representative
    // sample of current mandate focus instead of one search call per firm
    // ever added, which would make cost scale with database size.
    const allFirms = await prisma.firm.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: MAX_DATABASE_WIDE_BRIEFS });
    briefs = allFirms.map((f: { strategies: unknown; focusAreas: unknown; hqLocation: string | null; aumValue: unknown; targetMarkets: string[] }) => ({
      strategies: f.strategies as Record<string, string[]>,
      focusAreas: f.focusAreas as Record<string, string[]>,
      geography: f.hqLocation,
      targetMarkets: f.targetMarkets,
      aumBand: f.aumValue ? { min: Number(f.aumValue) * 0.5, max: Number(f.aumValue) * 2 } : null,
    }));
  }

  emit(`Searching for candidate firms matching ${briefs.length > 1 ? `${briefs.length} briefs` : "your criteria"}…`);
  const allCandidateNames = new Set<string>();
  // Ask for a bit more than needed per round since some candidates will turn
  // out to be duplicates already in the database.
  const perBriefTarget = Math.min(15, Math.ceil((maxFirmsToAdd * 1.5) / briefs.length));

  for (const brief of briefs) {
    try {
      const names = await searchCandidates(brief, perBriefTarget);
      names.forEach((n) => allCandidateNames.add(n));
    } catch {
      // One brief's search failing (e.g. transient API error in database_wide
      // mode with many firms) shouldn't abort the whole run — keep going.
    }
  }

  // by_criteria is the one mode with a single, user-facing target count, so
  // it's worth an extra round or two of searching (excluding names already
  // found) if the first pass came up short — the other modes run one brief
  // per existing firm and aren't asking for a specific headcount.
  if (params.mode === "by_criteria") {
    for (let round = 0; round < MAX_SEARCH_ROUNDS && allCandidateNames.size < maxFirmsToAdd; round++) {
      emit(`Found ${allCandidateNames.size} of ${maxFirmsToAdd} requested — searching for more…`);
      try {
        const more = await searchCandidates(briefs[0], maxFirmsToAdd - allCandidateNames.size, Array.from(allCandidateNames));
        if (more.length === 0) break;
        more.forEach((n) => allCandidateNames.add(n));
      } catch {
        break;
      }
    }
  }

  emit(`Found ${allCandidateNames.size} candidate(s)${allCandidateNames.size > maxFirmsToAdd ? ` — adding the first ${maxFirmsToAdd}` : ""}.`);

  let firmsAdded = 0;
  let firmsSkippedDuplicate = 0;
  const addedFirms: { id: string; name: string }[] = [];
  const researchWarnings: string[] = [];

  for (const name of allCandidateNames) {
    if (firmsAdded >= maxFirmsToAdd) break;

    const dup = await findDuplicate({ name });
    if (dup) {
      firmsSkippedDuplicate++;
      continue;
    }
    try {
      const outcome = await runFirmResearchPipeline({
        name,
        sourceType: "comparable",
        populateRunId: run.id,
        similarToFirmId: params.mode === "similar_to_firm" ? params.seedFirmId : null,
        onProgress: emit,
      });
      firmsAdded++;
      addedFirms.push({ id: outcome.firmId, name: outcome.name });
      if (outcome.researchWarning) researchWarnings.push(`${name}: ${outcome.researchWarning}`);
    } catch (e) {
      researchWarnings.push(`${name}: failed to add (${e instanceof Error ? e.message : "unknown error"})`);
    }
  }

  await prisma.populateRun.update({
    where: { id: run.id },
    data: { firmsFound: allCandidateNames.size, firmsAdded, firmsSkippedDuplicate },
  });

  return { runId: run.id, firmsFound: allCandidateNames.size, firmsAdded, firmsSkippedDuplicate, addedFirms, researchWarnings };
}
