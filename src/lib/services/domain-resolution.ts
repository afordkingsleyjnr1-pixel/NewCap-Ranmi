import { runWebResearch, extractJson } from "@/lib/anthropic";

const DOMAIN_SYSTEM_PROMPT = `You resolve an investment manager's official corporate website domain from its name. Search the web and identify the single, correct, official domain.

Respond with strict JSON only:
{"domain": "<domain.com or null>", "status": "resolved" | "ambiguous" | "unresolved", "hq_location": "<city, state/country or null>", "reasoning": "<short reason>"}

- "resolved": you are confident this is the one correct official site for this specific firm.
- "ambiguous": multiple similarly-named firms exist and you cannot confidently pick one.
- "unresolved": no clear web presence found for a firm by this name.
Never guess a plausible-looking domain when you are not confident — return "ambiguous" or "unresolved" instead.`;

export interface DomainResolutionResult {
  domain: string | null;
  status: "resolved" | "ambiguous" | "unresolved";
  hqLocation: string | null;
  reasoning: string | null;
}

export async function resolveDomain(firmName: string): Promise<DomainResolutionResult> {
  const raw = await runWebResearch({
    system: DOMAIN_SYSTEM_PROMPT,
    user: `Firm name: ${firmName}`,
    maxTokens: 512,
  });
  const parsed = extractJson<{
    domain?: string | null;
    status?: string;
    hq_location?: string | null;
    reasoning?: string;
  }>(raw);

  const status =
    parsed?.status === "resolved" || parsed?.status === "ambiguous" || parsed?.status === "unresolved"
      ? parsed.status
      : "unresolved";

  return {
    domain: status === "resolved" ? parsed?.domain ?? null : null,
    status,
    hqLocation: parsed?.hq_location ?? null,
    reasoning: parsed?.reasoning ?? null,
  };
}
