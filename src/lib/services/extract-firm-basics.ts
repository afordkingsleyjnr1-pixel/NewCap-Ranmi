import { TavilyResult } from "./tavily-search";

/**
 * Extract domain from Tavily results URLs.
 * Returns the most likely official domain.
 */
export function extractDomain(results: TavilyResult[]): string | null {
  if (results.length === 0) return null;

  // Try to find domain from URLs
  for (const result of results) {
    try {
      const url = new URL(result.url);
      const hostname = url.hostname.replace("www.", "");
      // Exclude common non-official domains
      if (!hostname.includes("linkedin") && !hostname.includes("crunchbase") && !hostname.includes("bloomberg")) {
        return hostname;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Extract HQ location from content using pattern matching.
 * Looks for "based in", "headquarters in", "located in" patterns.
 */
export function extractHqLocation(text: string): string | null {
  const patterns = [
    /(?:based in|headquarters in|located in|hq in)\s+([A-Za-z\s,]+?)(?:\.|,|$)/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+(?:United States|USA|US|Canada|UK|Europe)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const location = match[1].trim();
      if (location.length > 2 && location.length < 100) {
        return location;
      }
    }
  }

  return null;
}

export interface ExtractedContact {
  name: string;
  title: string | null;
}

/**
 * Extract contacts from content using pattern matching.
 * Looks for names and titles in team/leadership sections.
 * Prioritizes capital-raising related roles.
 */
export function extractContacts(text: string): ExtractedContact[] {
  const contacts: ExtractedContact[] = [];

  // Find team/leadership/management sections
  const teamSectionMatch = text.match(
    /(?:team|leadership|management|executives|our leadership|key team|meet the team)([\s\S]{0,3000}?)(?:board|investors|press|news|portfolio|$)/i
  );
  const teamSection = teamSectionMatch ? teamSectionMatch[1] : text.substring(0, 2000);

  // Patterns to find names and titles
  const patterns = [
    // "Name, Title" format
    /([A-Z][a-z]+ (?:[A-Z][a-z]+ )+),\s+([A-Z][a-z\s&-]+?)(?:\n|,|$)/g,
    // "Name - Title" format
    /([A-Z][a-z]+ (?:[A-Z][a-z]+ )+)\s*[-–]\s*([A-Z][a-z\s&-]+?)(?:\n|$)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(teamSection)) !== null) {
      const name = match[1]?.trim();
      const title = match[2]?.trim();

      if (name && name.length > 2 && name.length < 100 && title && title.length > 2 && title.length < 150) {
        // Prioritize capital-raising roles
        const capitalMarketsPriority =
          title.toLowerCase().includes("capital markets") ||
          title.toLowerCase().includes("capital introduction") ||
          title.toLowerCase().includes("capital formation");

        contacts.push({
          name,
          title,
        });

        // Early exit if we found a capital markets person
        if (capitalMarketsPriority) {
          return contacts.slice(0, 1); // Return just this one
        }
      }
    }
  }

  return contacts.slice(0, 3); // Max 3 contacts
}

/**
 * Score text relevance for firm research.
 * Higher score = more likely to contain firm info.
 */
export function scoreRelevance(text: string, firmName: string): number {
  let score = 0;

  // Boost if firm name appears multiple times
  const firmNameCount = (text.match(new RegExp(firmName, "gi")) || []).length;
  score += Math.min(firmNameCount * 2, 10);

  // Boost if contains key firm info keywords
  const keywordBoosts: Record<string, number> = {
    "assets under management": 5,
    aum: 5,
    billion: 3,
    million: 2,
    "investment strategy": 4,
    "about us": 3,
    leadership: 2,
    team: 1,
  };

  for (const [keyword, boost] of Object.entries(keywordBoosts)) {
    if (text.toLowerCase().includes(keyword)) {
      score += boost;
    }
  }

  // Penalize if looks like spam/ads
  if (text.length < 100 || text.includes("advertisement")) {
    score -= 5;
  }

  return Math.max(0, score);
}

/**
 * Combine extracted basics from multiple results.
 */
export function combineExtractions(results: TavilyResult[], firmName: string) {
  // Sort results by relevance
  const scored = results.map((r) => ({
    result: r,
    score: scoreRelevance(r.content, firmName),
  }));
  scored.sort((a, b) => b.score - a.score);

  const topContent = scored.map((s) => s.result.content).join("\n\n");

  return {
    domain: extractDomain(results),
    hqLocation: extractHqLocation(topContent),
    contacts: extractContacts(topContent),
  };
}
