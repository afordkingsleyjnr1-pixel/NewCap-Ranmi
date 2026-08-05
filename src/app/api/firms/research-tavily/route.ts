import { NextRequest, NextResponse } from "next/server";
import { researchFirmCoreTavily } from "@/lib/services/firm-core-research-tavily";
import { getTavilyApiKey } from "@/lib/services/settings-encryption";
import { auth } from "@/lib/auth";

/**
 * POST /api/firms/research-tavily
 * Research a firm using Tavily API for search + Claude for reasoning.
 * Requires Tavily API key to be configured in Settings.
 *
 * Request body:
 * { "firmName": "Insight Partners" }
 *
 * Response:
 * {
 *   "domain": "insightpartners.com",
 *   "domainStatus": "resolved",
 *   "aumValue": 90000000000,
 *   "aumConfidence": "confirmed",
 *   ...
 * }
 */
export async function POST(request: NextRequest) {
  try {
    await auth.admin();

    const { firmName } = await request.json();
    if (!firmName || typeof firmName !== "string") {
      return NextResponse.json({ error: "firmName is required" }, { status: 400 });
    }

    const tavilyApiKey = await getTavilyApiKey();
    if (!tavilyApiKey) {
      return NextResponse.json(
        {
          error: "Tavily API key not configured. Add it in Settings > Integrations.",
        },
        { status: 400 }
      );
    }

    const result = await researchFirmCoreTavily({
      firmName,
      tavilyApiKey,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Research error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Research failed",
      },
      { status: 500 }
    );
  }
}
