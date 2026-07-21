import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { runPopulate } from "@/lib/services/populate";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "run_populate");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  try {
    const result = await runPopulate({
      mode: body.mode,
      seedFirmId: body.seedFirmId,
      criteria: body.criteria,
      triggeredById: user!.id,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Populate failed" }, { status: 500 });
  }
}
