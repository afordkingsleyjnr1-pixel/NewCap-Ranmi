import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";

// Section 5.7 step 8 — "Review Reply": human-in-the-loop, one-click Interested / Declined.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "send_outreach");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const { outcome } = (await req.json()) as { outcome: "interested" | "declined" };

  const thread = await prisma.emailThread.findUniqueOrThrow({ where: { id } });
  const nextStage = outcome === "interested" ? "responded_interested" : "responded_not_interested";

  await prisma.crmStageRow.update({ where: { firmId: thread.firmId }, data: { stage: nextStage, stageChangedAt: new Date() } });
  await prisma.activityLog.create({
    data: { firmId: thread.firmId, type: "stage_change", body: `Reply reviewed: moved to ${nextStage}`, createdById: user!.id },
  });

  return NextResponse.json({ ok: true });
}
