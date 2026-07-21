import { runWebResearch, extractJson } from "@/lib/anthropic";

// Section 5.5 — Contact & Email Enrichment, steps 1-6 (the "Find contact" pipeline).
const CONTACT_SYSTEM_PROMPT = `You are a business-development research analyst identifying the best-fit capital markets / fundraising contact(s) at an institutional investment manager.

Follow this sequence:
1. Search the firm's own site (Team, About, Leadership, Investor Relations, Capital Markets, Fundraising pages) for named people and titles.
2. Actively ask yourself: "Who is the Director/Head of Capital Markets?", "Who leads Investor Relations or Fundraising?", "Who is Head of Business Development?" — search further for each question.
3. Go beyond the firm's website: press releases, LinkedIn, industry directories, conference speaker bios, news coverage.
4. Prioritize titles in this order: Head/Director of Capital Markets > Head of Investor Relations > Head of Business Development / BD > Fundraising lead > any senior IR/BD-adjacent title.

Respond with strict JSON only, shaped as:
{"contacts": [{"name": "...", "title": "...", "linkedin_url": "... or null", "source_description": "...", "rank": 1}]}
Rank 1 = best-fit primary contact. Return at most 3 contacts. If none can be found confidently, return {"contacts": []}. Never invent a name.`;

export interface DiscoveredContact {
  name: string;
  title: string | null;
  linkedinUrl: string | null;
  sourceDescription: string | null;
  rank: number;
}

export async function discoverContacts(params: { firmName: string; domain: string | null }): Promise<DiscoveredContact[]> {
  const user = `Firm: ${params.firmName}${params.domain ? `\nWebsite: ${params.domain}` : ""}\nFind the best-fit capital markets / fundraising contact(s).`;
  const raw = await runWebResearch({ system: CONTACT_SYSTEM_PROMPT, user, maxTokens: 1536 });
  const parsed = extractJson<{
    contacts?: Array<{ name?: string; title?: string; linkedin_url?: string; source_description?: string; rank?: number }>;
  }>(raw);

  if (!parsed?.contacts || !Array.isArray(parsed.contacts)) return [];

  return parsed.contacts
    .filter((c) => typeof c.name === "string" && c.name.trim().length > 0)
    .map((c, i) => ({
      name: c.name!.trim(),
      title: c.title ?? null,
      linkedinUrl: c.linkedin_url ?? null,
      sourceDescription: c.source_description ?? null,
      rank: typeof c.rank === "number" ? c.rank : i + 1,
    }));
}
