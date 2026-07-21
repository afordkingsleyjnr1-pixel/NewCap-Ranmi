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

export const RESEARCH_MODEL = "claude-sonnet-5";

/**
 * Runs a research-grade prompt with Claude's server-side web_search tool enabled,
 * used by domain resolution, AUM research, contact discovery, and Populate
 * (Sections 5.1, 5.3, 5.5, 5.10). Returns the final text response after Claude
 * has finished any tool-use turns.
 */
export async function runWebResearch(params: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const anthropic = getAnthropicClient();

  const response = await anthropic.messages.create({
    model: RESEARCH_MODEL,
    max_tokens: params.maxTokens ?? 4096,
    system: params.system,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 8,
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
