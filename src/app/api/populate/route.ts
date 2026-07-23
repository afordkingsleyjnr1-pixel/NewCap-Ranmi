import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { runPopulate } from "@/lib/services/populate";
import { ndjsonResponse } from "@/lib/ndjson-server";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "run_populate");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();

  // Streamed as NDJSON so the UI can show live progress — see ndjson-server.ts.
  return ndjsonResponse(async (send) => {
    return runPopulate({
      mode: body.mode,
      seedFirmId: body.seedFirmId,
      criteria: body.criteria,
      triggeredById: user!.id,
      onProgress: (message) => send({ type: "progress", message }),
    });
  });
}
