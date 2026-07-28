import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { getMandateSettings, recomputeMandateForAllFirms } from "@/lib/services/mandate";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const settings = await getMandateSettings();
  return NextResponse.json({ settings });
}

// Section 4.6 — editing the band immediately recomputes within_mandate for every existing firm.
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const body = await req.json();
  await prisma.mandateSettings.upsert({
    where: { id: 1 },
    create: { id: 1, aumMin: body.aumMin, aumMax: body.aumMax },
    update: { aumMin: body.aumMin, aumMax: body.aumMax },
  });
  const updated = await recomputeMandateForAllFirms();
  return NextResponse.json({ ok: true, firmsRecomputed: updated });
}
