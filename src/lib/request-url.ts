import { NextRequest } from "next/server";

/**
 * Absolute origin (protocol + host) for building links that go out in
 * emails — derived from the incoming request rather than a hardcoded
 * APP_URL env var, so invite/reset links are always correct for whichever
 * domain the admin is actually using (production, a preview deploy, a
 * custom domain) without needing manual per-environment configuration.
 * APP_URL is kept as a fallback for the rare non-request context.
 */
export function getBaseUrl(req: NextRequest): string {
  return req.nextUrl.origin || process.env.APP_URL || "";
}
