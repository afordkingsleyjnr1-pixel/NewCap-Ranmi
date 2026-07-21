import { prisma } from "@/lib/db";
import { runWebResearch, extractJson, isAnthropicConfigured } from "@/lib/anthropic";
import { findDuplicate } from "./dedupe";
import { runFirmResearchPipeline } from "./firm-pipeline";
import type { PopulateMode } from "@/generated/prisma";

const CANDIDATE_SEARCH_SYSTEM_PROMPT = `You are a manager-sourcing research analyst for an institutional capital-introduction platform. Given a search brief describing an investment strategy, focus area, geography, and AUM band, find real institutional investment managers that plausibly match ALL of the criteria.

Respond with strict JSON only:
{"candidates": ["Firm Name 1", "Firm Name 2", ...]}
Return up to 15 real, currently-operating firm names. Never invent a firm. If you cannot find confident matches, return an empty array.`;

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

async function searchCandidates(brief: SearchBrief): Promise<string[]> {
  const raw = await runWebResearch({
    system: CANDIDATE_SEARCH_SYSTEM_PROMPT,
    user: briefToPrompt(brief),
    maxTokens: 1024,
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
}

export async function runPopulate(params: {
  mode: PopulateMode;
  seedFirmId?: string;
  criteria?: SearchBrief;
  triggeredById: string;
}): Promise<PopulateResult> {
  if (!isAnthropicConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not set. Populate requires the Classification/Research engine to be configured.");
  }

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
    const allFirms = await prisma.firm.findMany({ where: { deletedAt: null } });
    briefs = allFirms.map((f: any) => ({
      strategies: f.strategies as Record<string, string[]>,
      focusAreas: f.focusAreas as Record<string, string[]>,
      geography: f.hqLocation,
      targetMarkets: f.targetMarkets,
      aumBand: f.aumValue ? { min: Number(f.aumValue) * 0.5, max: Number(f.aumValue) * 2 } : null,
    }));
  }

  const allCandidateNames = new Set<string>();
  for (const brief of briefs) {
    const names = await searchCandidates(brief);
    names.forEach((n) => allCandidateNames.add(n));
  }

  let firmsAdded = 0;
  let firmsSkippedDuplicate = 0;
  const addedFirms: { id: string; name: string }[] = [];

  for (const name of allCandidateNames) {
    const dup = await findDuplicate({ name });
    if (dup) {
      firmsSkippedDuplicate++;
      continue;
    }
    const outcome = await runFirmResearchPipeline({
      name,
      sourceType: "comparable",
      populateRunId: run.id,
      similarToFirmId: params.mode === "similar_to_firm" ? params.seedFirmId : null,
    });
    firmsAdded++;
    addedFirms.push({ id: outcome.firmId, name: outcome.name });
  }

  await prisma.populateRun.update({
    where: { id: run.id },
    data: { firmsFound: allCandidateNames.size, firmsAdded, firmsSkippedDuplicate },
  });

  return { runId: run.id, firmsFound: allCandidateNames.size, firmsAdded, firmsSkippedDuplicate, addedFirms };
}
