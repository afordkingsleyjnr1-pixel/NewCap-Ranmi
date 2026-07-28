import { prisma } from "@/lib/db";
import { STRATEGIES_TAXONOMY, FOCUS_AREAS_TAXONOMY } from "@/lib/taxonomy";
import type { TaxonomyKind } from "@/generated/prisma";

const DEFAULTS: Record<TaxonomyKind, Record<string, string[]>> = {
  strategy: STRATEGIES_TAXONOMY,
  focus_area: FOCUS_AREAS_TAXONOMY,
};

/** Reads the live, editable taxonomy for one kind — seeding it from the
 * hardcoded defaults on first read if Settings has never saved one yet. */
export async function getTaxonomy(kind: TaxonomyKind): Promise<Record<string, string[]>> {
  const row = await prisma.taxonomySet.upsert({
    where: { kind },
    update: {},
    create: { kind, data: DEFAULTS[kind] as object },
  });
  return row.data as Record<string, string[]>;
}

export async function getBothTaxonomies(): Promise<{
  strategies: Record<string, string[]>;
  focusAreas: Record<string, string[]>;
}> {
  const [strategies, focusAreas] = await Promise.all([getTaxonomy("strategy"), getTaxonomy("focus_area")]);
  return { strategies, focusAreas };
}

export async function saveTaxonomy(kind: TaxonomyKind, data: Record<string, string[]>) {
  return prisma.taxonomySet.upsert({
    where: { kind },
    update: { data: data as object },
    create: { kind, data: data as object },
  });
}
