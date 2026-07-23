import { runWebResearch, extractJson } from "@/lib/anthropic";
import { rankByCapitalMarketsPriority } from "./contact-ranking";

// Section 5.5 — Contact & Email Enrichment, steps 1-6. This is the standalone
// "Find Contact" call used on demand (the drawer button, or when Add Firm's
// combined research call — firm-core-research.ts — found no usable contacts).
// It is NOT run automatically as part of Add Firm anymore; that path now gets
// contacts from the same combined call as domain/AUM/classification to save
// a full extra Claude call per firm.
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
