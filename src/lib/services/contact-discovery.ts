import { runWebResearch, extractJson } from "@/lib/anthropic";

// Section 5.5 — Contact & Email Enrichment, steps 1-6 (the "Find contact" pipeline).
//
// NewCap's whole value proposition rests on surfacing the right contact first,
// every time — so ranking is NOT left purely to the model. The prompt asks the
// model to prioritize Capital Markets / Capital Introductions / Capital
// Formation titles, but `rankByCapitalMarketsPriority` below re-sorts the
// model's output deterministically afterward, so a same-titled result can
// never slip below a lower-priority one no matter what the model returns.
const CONTACT_SYSTEM_PROMPT = `You are a business-development research analyst identifying the best-fit capital-raising contact(s) at an institutional investment manager, for a capital introductions platform.

Follow this sequence:
1. Search the firm's own site (Team, About, Leadership, Investor Relations, Capital Markets, Capital Formation, Fundraising pages) for named people and titles.
2. The single highest priority: find anyone whose title contains the words "Capital Markets", "Capital Introductions", or "Capital Formation" — at ANY seniority level (Analyst, Associate, VP, Director, Head, Managing Director, Partner, etc. all count equally). A "Director of Capital Markets" and an "Associate, Capital Formation" both outrank a "Head of Investor Relations" who has none of those three phrases in their title. Search explicitly for these three phrases before anything else.
3. Only if nobody at the firm has one of those three phrases in their title, fall back to the next-best capital-raising contact: Head of Investor Relations > Head of Business Development / BD > Fundraising lead > any senior IR/BD-adjacent title.
4. Go beyond the firm's website: press releases, LinkedIn, industry directories, conference speaker bios, news coverage.
5. Include alternate/secondary contacts after the primary one if you find other people who do the same kind of work (capital markets, capital introductions, capital formation, IR, BD, fundraising) at the firm.

Respond with strict JSON only, shaped as:
{"contacts": [{"name": "...", "title": "...", "linkedin_url": "... or null", "source_description": "...", "rank": 1}]}
Rank 1 = best-fit primary contact, in priority order per the rules above. Return at most 3 contacts. If none can be found confidently, return {"contacts": []}. Never invent a name.`;

/** Matches "Capital Markets", "Capital Introductions"/"Capital Introduction", "Capital Formation" anywhere in a title, regardless of seniority word around it. */
const CAPITAL_MARKETS_TITLE_RE = /capital\s+(markets|introductions?|formation)/i;

function hasCapitalMarketsTitle(title: string | null): boolean {
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
function rankByCapitalMarketsPriority<T extends { title: string | null }>(contacts: T[]): T[] {
  const priority = contacts.filter((c) => hasCapitalMarketsTitle(c.title));
  const rest = contacts.filter((c) => !hasCapitalMarketsTitle(c.title));
  return [...priority, ...rest];
}

export interface DiscoveredContact {
  name: string;
  title: string | null;
  linkedinUrl: string | null;
  sourceDescription: string | null;
  rank: number;
}

export async function discoverContacts(params: { firmName: string; domain: string | null }): Promise<DiscoveredContact[]> {
  const user = `Firm: ${params.firmName}${params.domain ? `\nWebsite: ${params.domain}` : ""}\nFind the best-fit capital markets / fundraising contact(s).`;
  const raw = await runWebResearch({ system: CONTACT_SYSTEM_PROMPT, user, maxTokens: 1536, maxUses: 3 });
  const parsed = extractJson<{
    contacts?: Array<{ name?: string; title?: string; linkedin_url?: string; source_description?: string; rank?: number }>;
  }>(raw);

  if (!parsed?.contacts || !Array.isArray(parsed.contacts)) return [];

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

  return rankByCapitalMarketsPriority(mapped).map((c, i) => ({ ...c, rank: i + 1 }));
}
