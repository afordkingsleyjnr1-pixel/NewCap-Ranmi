import { NextResponse } from "next/server";
import { getTavilyApiKey } from "@/lib/services/settings-encryption";

export async function GET() {
  try {
    const key = await getTavilyApiKey();
    return NextResponse.json({
      tavilyKeyExists: !!key,
      keyLength: key ? key.length : 0,
      status: key ? "configured" : "not configured",
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Unknown error",
        status: "error",
      },
      { status: 500 }
    );
  }
}
