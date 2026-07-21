import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { CLOSING_CHECKLIST_TEMPLATE } from "@/lib/crm-stages";

// Section 5.6 — manual/CRM stage change. Every change writes an activity_log
// row automatically. Do Not Contact is a hard stop enforced elsewhere (send/meeting routes);
// moving OUT of it is always allowed here since that's the only way out.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "edit_firms");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id: firmId } = await params;
  const body = await req.json();
  const stage = body.stage as string;

  const before = await prisma.crmStageRow.findUniqueOrThrow({ where: { firmId } });

  await prisma.crmStageRow.update({
    where: { firmId },
    data: { stage: stage as never, stageChangedAt: new Date() },
  });

  await prisma.activityLog.create({
    data: {
      firmId,
      type: "stage_change",
      body: `Stage changed from ${before.stage} to ${stage}`,
      createdById: user!.id,
    },
  });

  // Section 5.9 — Term Sheet / LOI entry auto-generates the closing checklist.
  if (stage === "term_sheet_loi" && before.stage !== "term_sheet_loi") {
    const existingTemplateTasks = await prisma.task.count({ where: { firmId, isFromTemplate: true } });
    if (existingTemplateTasks === 0) {
      await prisma.task.createMany({
        data: CLOSING_CHECKLIST_TEMPLATE.map((title) => ({ firmId, title, isFromTemplate: true, status: "open" as const })),
      });
    }
  }

  const updated = await prisma.crmStageRow.findUniqueOrThrow({ where: { firmId } });
  return NextResponse.json({ crmStage: updated });
}
