import { prisma } from "@/lib/db";
import { runWebResearch, extractJson, isAnthropicConfigured } from "@/lib/anthropic";
import { formatAum } from "@/lib/utils";
import { findDuplicate } from "./dedupe";
import { runFirmResearchPipeline } from "./entity-pipeline";
import type { PopulateMode } from "@/generated/prisma";

function candidateSearchPrompt(desiredCount: number, exclude?: string[]): string {
  const excludeLine = exclude?.length ? `\nDo not repeat any of these already-found entities: ${exclude.join(", ")}.` : "";
  return `You are a manager-sourcing research analyst for an institutional capital-introduction platform. Given a search brief describing an investment strategy, focus area, geography, and AUM band, find real institutional investment managers that plausibly match ALL of the criteria.

Respond with strict JSON only:
{"candidates": ["Entity Name 1", "Entity Name 2", ...]}
Return up to ${desiredCount} real, currently-operating entity names. Never invent a entity. If you cannot find confident matches, return an empty array.${excludeLine}`;
}

// Cost/runaway-spend guards. Without these, "Populate the whole database"
// runs one search call per EXISTING entity (cost scales with database size,
// not with what you're actually looking for), and any Populate run could
// silently add and fully research dozens of entities from one click. Both are
// capped here rather than left to trust the model's own restraint.
const MAX_DATABASE_WIDE_BRIEFS = 10;
const MAX_FIRMS_ADDED_PER_RUN = 20;
// User-facing "Number of entities" input (By Strategy & Focus Area mode) is
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
    lines.push(
      `AUM band: $${brief.aumBand.min ?? 0} - $${brief.aumBand.max ?? "unbounded"}. This is a hard requirement, not a preference — only return entities whose current AUM you can find falls inside this exact range. Do not include a entity whose AUM is outside this band even if it otherwise matches well.`
    );
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

// by_criteria is the one mode with an explicit, user-set AUM band — the
// candidate search prompt only ever treats it as a hint (the model can and
// does surface entities outside it), so the actual researched AUM is checked
// here and anything outside the band is discarded rather than added. Other
// modes (Similar to a Entity, Across Entire Database) derive their own
// AUM range from an existing entity rather than a user-set band, so this
// filter intentionally doesn't apply to them.
function outsideAumBand(aumValue: number | null, band: { min?: number; max?: number } | null | undefined): boolean {
  if (!band || aumValue == null) return false;
  if (band.min != null && aumValue < band.min) return true;
  if (band.max != null && aumValue > band.max) return true;
  return false;
}

// Find Similar Entities previously relied on the candidate-search prompt alone
// to stay "similar" (an AUM band hint plus copying the seed's exact
// strategies/focus areas into the brief) — anything the model returned was
// added outright, so a entity miles off on AUM or with only a token strategy
// overlap could still get through. This scores each candidate against the
// seed across five weighted factors and discards anything below threshold,
// mirroring the outsideAumBand/discardFirm pattern already used for
// by_criteria. Any factor missing data on either side scores neutral (0.5)
// rather than 0 — an absent field shouldn't sink an otherwise-strong match.
const SIMILARITY_WEIGHTS = { aum: 0.3, strategies: 0.25, focusAreas: 0.2, geography: 0.15, targetMarkets: 0.1 };
const SIMILARITY_THRESHOLD = 0.35;

function flattenTaxonomy(t: Record<string, string[]> | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!t) return out;
  for (const [parent, children] of Object.entries(t)) {
    if (!children?.length) out.add(parent);
    else children.forEach((c) => out.add(`${parent}:${c}`));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0.5;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0.5 : intersection / union;
}

function geographyScore(seedHq: string | null, candidateHq: string | null): number {
  if (!seedHq || !candidateHq) return 0.5;
  const a = seedHq.toLowerCase();
  const b = candidateHq.toLowerCase();
  const seedCountry = a.split(",").pop()?.trim() ?? a;
  const candidateCountry = b.split(",").pop()?.trim() ?? b;
  if (seedCountry === candidateCountry) return 1;
  if (a.includes(b) || b.includes(a)) return 0.7;
  return 0;
}

function aumProximityScore(seedAum: number | null, candidateAum: number | null): number {
  if (seedAum == null || candidateAum == null || seedAum <= 0 || candidateAum <= 0) return 0.5;
  return Math.min(seedAum, candidateAum) / Math.max(seedAum, candidateAum);
}

interface SimilarityProfile {
  strategies: Record<string, string[]> | null;
  focusAreas: Record<string, string[]> | null;
  hqLocation: string | null;
  aumValue: number | null;
  targetMarkets: string[];
}

function similarityScore(seed: SimilarityProfile, candidate: SimilarityProfile): number {
  const aum = aumProximityScore(seed.aumValue, candidate.aumValue);
  const strategies = jaccard(flattenTaxonomy(seed.strategies), flattenTaxonomy(candidate.strategies));
  const focusAreas = jaccard(flattenTaxonomy(seed.focusAreas), flattenTaxonomy(candidate.focusAreas));
  const geography = geographyScore(seed.hqLocation, candidate.hqLocation);
  const targetMarkets = jaccard(new Set(seed.targetMarkets ?? []), new Set(candidate.targetMarkets ?? []));
  return (
    aum * SIMILARITY_WEIGHTS.aum +
    strategies * SIMILARITY_WEIGHTS.strategies +
    focusAreas * SIMILARITY_WEIGHTS.focusAreas +
    geography * SIMILARITY_WEIGHTS.geography +
    targetMarkets * SIMILARITY_WEIGHTS.targetMarkets
  );
}

// Cleans up a entity created moments ago by runFirmResearchPipeline once it's
// determined to be outside the requested AUM band — mirrors the deletion
// order used by the Recently Deleted → Delete Permanently purge route.
async function discardFirm(entityId: string): Promise<void> {
  const contactIds = (await prisma.contact.findMany({ where: { entityId }, select: { id: true } })).map((c: { id: string }) => c.id);
  await prisma.$transaction([
    prisma.researchSource.deleteMany({
      where: { OR: [{ entityType: "entity", entityId: entityId }, { entityType: "contact", entityId: { in: contactIds } }] },
    }),
    prisma.task.deleteMany({ where: { entityId } }),
    prisma.contact.deleteMany({ where: { entityId } }),
    prisma.entityStage.deleteMany({ where: { entityId } }),
    prisma.entity.delete({ where: { id: entityId } }),
  ]);
}

export interface PopulateResult {
  runId: string;
  entitiesFound: number;
  entitiesAdded: number;
  entitiesSkippedDuplicate: number;
  addedFirms: { id: string; name: string }[];
  researchWarnings: string[];
}

export async function runPopulate(params: {
  mode: PopulateMode;
  seedEntityId?: string;
  criteria?: SearchBrief;
  /** "Number of entities" the user asked for (By Strategy & Focus Area mode only). Clamped to [1, 50]; other modes ignore this and keep the flat 20-per-run cap. */
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
      seedEntityId: params.seedEntityId ?? null,
      criteria: params.criteria ? (params.criteria as object) : undefined,
      triggeredById: params.triggeredById,
    },
  });

  let briefs: SearchBrief[] = [];
  let seedProfile: SimilarityProfile | null = null;

  if (params.mode === "similar_to_firm") {
    const seed = await prisma.entity.findUniqueOrThrow({ where: { id: params.seedEntityId! } });
    seedProfile = {
      strategies: seed.strategies as Record<string, string[]>,
      focusAreas: seed.focusAreas as Record<string, string[]>,
      hqLocation: seed.hqLocation,
      aumValue: seed.aumValue ? Number(seed.aumValue) : null,
      targetMarkets: seed.targetMarkets,
    };
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
    // sample of current mandate focus instead of one search call per entity
    // ever added, which would make cost scale with database size.
    const allFirms = await prisma.entity.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: MAX_DATABASE_WIDE_BRIEFS });
    briefs = allFirms.map((f: { strategies: unknown; focusAreas: unknown; hqLocation: string | null; aumValue: unknown; targetMarkets: string[] }) => ({
      strategies: f.strategies as Record<string, string[]>,
      focusAreas: f.focusAreas as Record<string, string[]>,
      geography: f.hqLocation,
      targetMarkets: f.targetMarkets,
      aumBand: f.aumValue ? { min: Number(f.aumValue) * 0.5, max: Number(f.aumValue) * 2 } : null,
    }));
  }

  emit(`Searching for candidate entities matching ${briefs.length > 1 ? `${briefs.length} briefs` : "your criteria"}…`);
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
      // mode with many entities) shouldn't abort the whole run — keep going.
    }
  }

  // by_criteria and similar_to_firm both run off a single brief with a
  // specific target headcount, so both are worth an extra round or two of
  // searching (excluding names already found) if the first pass came up
  // short — previously only by_criteria retried, which is why Find Similar
  // Entities (similar_to_firm) so often "failed on the first attempt" whenever
  // that single web-search call came back thin or empty. database_wide runs
  // one brief per existing entity and isn't asking for a specific headcount,
  // so it's intentionally left out of this retry.
  if (params.mode === "by_criteria" || params.mode === "similar_to_firm") {
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

  let entitiesAdded = 0;
  let entitiesSkippedDuplicate = 0;
  const addedFirms: { id: string; name: string }[] = [];
  const researchWarnings: string[] = [];

  for (const name of allCandidateNames) {
    if (entitiesAdded >= maxFirmsToAdd) break;

    const dup = await findDuplicate({ name });
    if (dup) {
      entitiesSkippedDuplicate++;
      continue;
    }
    try {
      const outcome = await runFirmResearchPipeline({
        name,
        sourceType: "comparable",
        populateRunId: run.id,
        similarToFirmId: params.mode === "similar_to_firm" ? params.seedEntityId : null,
        onProgress: emit,
      });

      if (params.mode === "by_criteria" && outsideAumBand(outcome.aumValue, params.criteria?.aumBand)) {
        await discardFirm(outcome.entityId);
        researchWarnings.push(
          `${name}: skipped — AUM ${formatAum(outcome.aumValue)} is outside the requested $${params.criteria?.aumBand?.min ? formatAum(params.criteria.aumBand.min) : "0"}–${params.criteria?.aumBand?.max ? formatAum(params.criteria.aumBand.max) : "unbounded"} band.`
        );
        continue;
      }

      if (params.mode === "similar_to_firm" && seedProfile) {
        const candidate = await prisma.entity.findUniqueOrThrow({ where: { id: outcome.entityId } });
        const score = similarityScore(seedProfile, {
          strategies: candidate.strategies as Record<string, string[]>,
          focusAreas: candidate.focusAreas as Record<string, string[]>,
          hqLocation: candidate.hqLocation,
          aumValue: candidate.aumValue ? Number(candidate.aumValue) : null,
          targetMarkets: candidate.targetMarkets,
        });
        if (score < SIMILARITY_THRESHOLD) {
          await discardFirm(outcome.entityId);
          researchWarnings.push(`${name}: skipped — only ${Math.round(score * 100)}% similar to the seed entity.`);
          continue;
        }
      }

      entitiesAdded++;
      addedFirms.push({ id: outcome.entityId, name: outcome.name });
      if (outcome.researchWarning) researchWarnings.push(`${name}: ${outcome.researchWarning}`);
    } catch (e) {
      researchWarnings.push(`${name}: failed to add (${e instanceof Error ? e.message : "unknown error"})`);
    }
  }

  await prisma.populateRun.update({
    where: { id: run.id },
    data: { entitiesFound: allCandidateNames.size, entitiesAdded, entitiesSkippedDuplicate },
  });

  return { runId: run.id, entitiesFound: allCandidateNames.size, entitiesAdded, entitiesSkippedDuplicate, addedFirms, researchWarnings };
}
