import { runWebResearch, extractJson } from "@/lib/anthropic";
import { formatAum } from "@/lib/utils";

const AUM_SYSTEM_PROMPT = `You are an AUM (Assets Under Management) research analyst for an institutional manager sourcing platform. Find the clearest, most current AUM figure for the given investment manager by searching their website (About/Overview, Investment Strategy, Investor Relations pages) and other reliable sources.

Respond with strict JSON only, shaped exactly as:
{"aum_value_usd": <number or null>, "as_of_date": "<YYYY-MM-DD or null>", "confidence": "confirmed" | "dated" | "unconfirmed", "source_description": "<page/section cited>"}

Rules:
- confidence "confirmed": stated plainly and currently on the firm's own site.
- confidence "dated": the figure is over 12 months old or phrased historically.
- confidence "unconfirmed": pieced together from indirect signals like cumulative deal volume.
- If nothing reliable is found, aum_value_usd must be null and confidence "unconfirmed".
- Never fabricate a number.`;

export interface AumResult {
  aumValue: number | null;
  aumDisplay: string;
  aumAsOf: string | null;
  aumConfidence: "confirmed" | "dated" | "unconfirmed";
  sourceDescription: string | null;
}

export async function researchAum(params: { firmName: string; domain: string | null }): Promise<AumResult> {
  const user = `Firm: ${params.firmName}${params.domain ? `\nWebsite: ${params.domain}` : ""}\nFind their current AUM.`;
  const raw = await runWebResearch({ system: AUM_SYSTEM_PROMPT, user, maxTokens: 1024 });
  const parsed = extractJson<{
    aum_value_usd?: number | null;
    as_of_date?: string | null;
    confidence?: string;
    source_description?: string;
  }>(raw);

  const aumValue = typeof parsed?.aum_value_usd === "number" ? parsed.aum_value_usd : null;
  const confidence =
    parsed?.confidence === "confirmed" || parsed?.confidence === "dated" ? parsed.confidence : "unconfirmed";

  return {
    aumValue,
    aumDisplay: formatAum(aumValue, confidence),
    aumAsOf: parsed?.as_of_date ?? null,
    aumConfidence: confidence,
    sourceDescription: parsed?.source_description ?? null,
  };
}
