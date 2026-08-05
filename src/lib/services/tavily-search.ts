export interface TavilyResult {
  url: string;
  title: string;
  content: string; // AI-optimized cleaned text
  raw_content: string | null; // Full page text if available
  score: number;
  published_date?: string;
  source_description?: string;
}

export interface TavilySearchResponse {
  query: string;
  results: Array<{
    url: string;
    title: string;
    content: string;
    raw_content: string | null;
    score: number;
    published_date?: string;
  }>;
  follow_up_questions: string[] | null;
  answer: string | null;
  response_time: number;
  request_id: string;
}

/**
 * Search using Tavily API.
 * Returns cleaned content ready for Claude reasoning.
 * search_depth: "advanced" enables crawling of related pages + extraction.
 */
export async function searchWithTavily(params: {
  query: string;
  tavilyApiKey: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
}): Promise<TavilyResult[]> {
  if (!params.tavilyApiKey) {
    throw new Error("Tavily API key not configured");
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: params.tavilyApiKey,
      query: params.query,
      search_depth: params.searchDepth ?? "advanced",
      include_raw_content: true,
      max_results: params.maxResults ?? 3,
      topic: "general", // "news" for breaking news, "general" for regular web search
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tavily API error: ${response.status} — ${error}`);
  }

  const data = (await response.json()) as TavilySearchResponse;

  return data.results.map((r) => ({
    url: r.url,
    title: r.title,
    content: r.content,
    raw_content: r.raw_content,
    score: r.score,
    published_date: r.published_date,
    source_description: `${r.title} (${new URL(r.url).hostname})`,
  }));
}

/**
 * Search and extract key facts for research.
 * Combines results into a clean research-ready format.
 */
export async function tavilyResearch(params: {
  query: string;
  tavilyApiKey: string;
  maxResults?: number;
}): Promise<string> {
  const results = await searchWithTavily({
    query: params.query,
    tavilyApiKey: params.tavilyApiKey,
    maxResults: params.maxResults ?? 3,
    searchDepth: "advanced",
  });

  if (results.length === 0) {
    return `No results found for: ${params.query}`;
  }

  // Format for Claude: include cleaned content + sources
  return results
    .map(
      (r) => `
# ${r.title}
**Source:** ${r.url}
**Relevance:** ${(r.score * 100).toFixed(0)}%
${r.published_date ? `**Published:** ${r.published_date}` : ""}

${r.content}
`
    )
    .join("\n---\n");
}
