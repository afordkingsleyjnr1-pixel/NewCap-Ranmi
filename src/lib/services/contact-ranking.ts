// Shared by contact-discovery.ts (the standalone "Find Contact" button) and
// firm-core-research.ts (contacts found as part of the combined Add Firm
// research call) — one deterministic ranking rule, not duplicated logic that
// could drift between the two call sites.

/** Matches "Capital Markets", "Capital Introductions"/"Capital Introduction", "Capital Formation" anywhere in a title, regardless of seniority word around it. */
const CAPITAL_MARKETS_TITLE_RE = /capital\s+(markets|introductions?|formation)/i;

export function hasCapitalMarketsTitle(title: string | null): boolean {
  return !!title && CAPITAL_MARKETS_TITLE_RE.test(title);
}

/**
 * Deterministic safety net on top of the model's own ranking: contacts whose
 * title contains "Capital Markets" / "Capital Introductions" / "Capital
 * Formation" always sort before every other contact, in their existing
 * relative order; everyone else follows, also in their existing relative
 * order. Ranks are then renumbered 1..n to match the new order. This makes
 * mis-ranking by the model impossible to observe downstream — the exact
 * outcome the platform's usefulness depends on.
 */
export function rankByCapitalMarketsPriority<T extends { title: string | null }>(contacts: T[]): T[] {
  const priority = contacts.filter((c) => hasCapitalMarketsTitle(c.title));
  const rest = contacts.filter((c) => !hasCapitalMarketsTitle(c.title));
  return [...priority, ...rest];
}
