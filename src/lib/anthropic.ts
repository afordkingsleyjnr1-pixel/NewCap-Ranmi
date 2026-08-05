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
 * Runs a research-grade prompt with Claude's server-side web_search and
 * web_fetch tools BOTH always enabled, unconditionally — used by domain
 * resolution, AUM research, contact discovery, and Populate (Sections 5.1,
 * 5.3, 5.5, 5.10). Returns the final text response after Claude has
 * finished any tool-use turns.
 *
 * The intended shape of every research call is: ONE web_search to locate the
 * right URL(s), then web_fetch to actually pull the page content and extract
 * data from it — search finds the source, fetch reads it. Defaults enforce
 * this ratio: `maxUses` (default 1) caps web_search — each search is billed
 * at $10/1,000 separately from token usage, so it should be used once to
 * locate the source, not repeatedly. `maxFetches` (default 2) caps
 * web_fetch — no per-call fee, just standard token cost for the fetched
 * page — so once the URL is known, the model fetches the page(s) directly
 * for full content instead of burning additional searches to piece together
 * partial snippets.
 *
 * `cacheableSystemExtra` is for large, byte-identical-across-calls content
 * (e.g. the Strategies/Focus Areas taxonomy JSON) — it's sent as its own
 * system block with `cache_control`, so repeated calls within the cache
 * window (~5 min) pay full price only once instead of on every single call.
 * Below Anthropic's minimum cacheable block size (~2048 tokens for Haiku),
 * the block is simply not cached — no error, just no savings.
 */
function isRetryableStatus(status: unknown): boolean {
  return typeof status === "number" && (status === 429 || status === 408 || status === 409 || status >= 500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runWebResearch(params: {
  system: string;
  user: string;
  maxTokens?: number;
  maxUses?: number;
  maxFetches?: number;
  cacheableSystemExtra?: string;
}): Promise<string> {
  const anthropic = getAnthropicClient();

  const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
    { type: "text", text: params.system, cache_control: { type: "ephemeral" } },
  ];
  if (params.cacheableSystemExtra) {
    systemBlocks.push({ type: "text", text: params.cacheableSystemExtra, cache_control: { type: "ephemeral" } });
  }

  // Both tools are always enabled — web_search and web_fetch are not optional
  // extras, every runWebResearch call gets both regardless of whether the
  // caller specifies maxFetches.
  const tools: Anthropic.Messages.Tool[] = [
    {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: params.maxUses ?? 1,
    } as unknown as Anthropic.Messages.Tool,
    {
      type: "web_fetch_20250910",
      name: "web_fetch",
      max_uses: params.maxFetches ?? 2,
    } as unknown as Anthropic.Messages.Tool,
  ];

  // Research calls hit Anthropic's web_search/web_fetch tools, which can
  // transiently 429/529 under load — one retry with a short backoff turns
  // a would-be "came back with nothing" into a normal result instead of
  // surfacing every transient blip as a hard failure.
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(1500);
    try {
      const response = await anthropic.messages.create({
        model: RESEARCH_MODEL,
        max_tokens: params.maxTokens ?? 4096,
        system: systemBlocks,
        tools,
        messages: [{ role: "user", content: params.user }],
      });

      return response.content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
    } catch (e) {
      lastError = e;
      const status = e && typeof e === "object" && "status" in e ? (e as { status: unknown }).status : undefined;
      if (!isRetryableStatus(status)) throw e;
    }
  }
  throw lastError;
}

/**
 * Plain completion, no web_search tool — for prompts that only need the
 * model's own reasoning (e.g. generating a taxonomy structure from a
 * natural-language brief), where a search call would just be unbilled-for
 * cost with no benefit. Supports cacheableSystemExtra for large, repeated
 * blocks like taxonomy references.
 */
export async function runCompletion(params: {
  system: string;
  user: string;
  maxTokens?: number;
  cacheableSystemExtra?: string;
  model?: string;
}): Promise<string> {
  const anthropic = getAnthropicClient();

  const systemBlocks: Anthropic.Messages.TextBlockParam[] = [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }];
  if (params.cacheableSystemExtra) {
    systemBlocks.push({ type: "text", text: params.cacheableSystemExtra, cache_control: { type: "ephemeral" } });
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(1500);
    try {
      const response = await anthropic.messages.create({
        model: params.model ?? RESEARCH_MODEL,
        max_tokens: params.maxTokens ?? 2048,
        system: systemBlocks,
        messages: [{ role: "user", content: params.user }],
      });
      return response.content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
    } catch (e) {
      lastError = e;
      const status = e && typeof e === "object" && "status" in e ? (e as { status: unknown }).status : undefined;
      if (!isRetryableStatus(status)) throw e;
    }
  }
  throw lastError;
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
