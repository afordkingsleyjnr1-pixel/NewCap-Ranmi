import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function isAnthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env to enable the Classification Engine, " +
        "firm research, and Populate. See Settings for status."
    );
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Cost lever: Haiku 4.5 is materially cheaper per token than Sonnet for this
// research/JSON-extraction workload. Web search fees (billed per search, not
// per token) are unaffected by the model choice — see maxUses below for that.
export const RESEARCH_MODEL = "claude-haiku-4-5-20251001";

/**
 * Runs a research-grade prompt with Claude's server-side web_search tool enabled,
 * used by domain resolution, AUM research, contact discovery, and Populate
 * (Sections 5.1, 5.3, 5.5, 5.10). Returns the final text response after Claude
 * has finished any tool-use turns.
 *
 * `maxUses` caps how many searches a single call can run — each search is
 * billed separately from token usage, so this is the main spend lever
 * alongside consolidating multiple research steps into fewer calls.
 *
 * `cacheableSystemExtra` is for large, byte-identical-across-calls content
 * (e.g. the Strategies/Focus Areas taxonomy JSON) — it's sent as its own
 * system block with `cache_control`, so repeated calls within the cache
 * window (~5 min) pay full price only once instead of on every single call.
 * Below Anthropic's minimum cacheable block size (~2048 tokens for Haiku),
 * the block is simply not cached — no error, just no savings.
 */
export async function runWebResearch(params: {
  system: string;
  user: string;
  maxTokens?: number;
  maxUses?: number;
  cacheableSystemExtra?: string;
}): Promise<string> {
  const anthropic = getAnthropicClient();

  const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
    { type: "text", text: params.system, cache_control: { type: "ephemeral" } },
  ];
  if (params.cacheableSystemExtra) {
    systemBlocks.push({ type: "text", text: params.cacheableSystemExtra, cache_control: { type: "ephemeral" } });
  }

  const response = await anthropic.messages.create({
    model: RESEARCH_MODEL,
    max_tokens: params.maxTokens ?? 4096,
    system: systemBlocks,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: params.maxUses ?? 4,
      } as unknown as Anthropic.Messages.Tool,
    ],
    messages: [{ role: "user", content: params.user }],
  });

  return response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/** Extracts the first {...} JSON object from a possibly prose-wrapped LLM response. */
export function extractJson<T = unknown>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
