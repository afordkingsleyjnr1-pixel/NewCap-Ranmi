import { prisma } from "@/lib/db";

// Section 6 — dedupe integrity: exact-name, domain, and fuzzy-name matching
// to catch near-duplicates like "Toorak Capital Partners" vs "Toorak Capital Partners, LLC".

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(llc|lp|l\.p\.|inc|incorporated|ltd|limited|partners|capital|group|holdings|co\.?)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export interface DedupeMatch {
  firmId: string;
  name: string;
  reason: "exact_name" | "domain" | "fuzzy_name";
  deleted: boolean;
}

/**
 * Checks a candidate firm name/domain against every existing firm (including
 * soft-deleted ones — Section 5.6, "dedupe still checks against soft-deleted firms").
 */
export async function findDuplicate(params: { name: string; domain?: string | null }): Promise<DedupeMatch | null> {
  const candidates = await prisma.firm.findMany({
    select: { id: true, name: true, domain: true, deletedAt: true },
  });

  const targetNorm = normalizeName(params.name);
  const targetDomain = params.domain?.toLowerCase().replace(/^www\./, "") ?? null;

  for (const firm of candidates) {
    if (firm.name.toLowerCase() === params.name.toLowerCase()) {
      return { firmId: firm.id, name: firm.name, reason: "exact_name", deleted: !!firm.deletedAt };
    }
  }

  if (targetDomain) {
    for (const firm of candidates) {
      const firmDomain = firm.domain?.toLowerCase().replace(/^www\./, "") ?? null;
      if (firmDomain && firmDomain === targetDomain) {
        return { firmId: firm.id, name: firm.name, reason: "domain", deleted: !!firm.deletedAt };
      }
    }
  }

  for (const firm of candidates) {
    const firmNorm = normalizeName(firm.name);
    if (firmNorm.length === 0 || targetNorm.length === 0) continue;
    if (similarity(targetNorm, firmNorm) >= 0.88) {
      return { firmId: firm.id, name: firm.name, reason: "fuzzy_name", deleted: !!firm.deletedAt };
    }
  }

  return null;
}
