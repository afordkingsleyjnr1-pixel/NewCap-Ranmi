import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { createPendingTask } from "@/lib/services/pipeline-tasks";

// Section 4 — "Responded" stage: the user reviews the reply and picks one of
// two outcomes. Interested keeps the firm at "Responded" but creates the
// "Schedule Meeting" task, which is what flips the Next Step from "Review
// Reply" to "Set Meeting" (Section: computeNextStep in lib/crm-stages.ts).
// Not Interested moves the firm straight to Nurture.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "send_outreach");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id: firmId } = await params;
  const { outcome } = (await req.json()) as { outcome: "interested" | "not_interested" };

  const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId } });

  if (outcome === "interested") {
    await createPendingTask(firmId, firm.name, "schedule_meeting");
    await prisma.activityLog.create({
      data: { firmId, type: "note", body: "Reply reviewed: marked Interested — ready to schedule a meeting.", createdById: user!.id },
    });
  } else {
    await prisma.crmStageRow.update({ where: { firmId }, data: { stage: "nurture", stageChangedAt: new Date() } });
    await prisma.activityLog.create({
      data: { firmId, type: "stage_change", body: "Reply reviewed: marked Not Interested — moved to Nurture.", createdById: user!.id },
    });
  }

  return NextResponse.json({ ok: true });
}
