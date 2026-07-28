import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { runPopulate } from "@/lib/services/populate";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { action, firmIds } = body as { action: string; firmIds: string[] };

  if (!Array.isArray(firmIds) || firmIds.length === 0) {
    return NextResponse.json({ error: "firmIds required" }, { status: 400 });
  }

  try {
    switch (action) {
      case "stage_change": {
        await requirePermission(user, "edit_firms");
        for (const firmId of firmIds) {
          const before = await prisma.crmStageRow.findUnique({ where: { firmId } });
          if (before?.stage === "do_not_contact") continue; // hard stop, Section 5.6
          await prisma.crmStageRow.update({ where: { firmId }, data: { stage: body.stage, stageChangedAt: new Date() } });
          await prisma.activityLog.create({
            data: { firmId, type: "stage_change", body: `Stage changed to ${body.stage} (bulk)`, createdById: user.id },
          });
        }
        return NextResponse.json({ updated: firmIds.length });
      }
      case "assign_owner": {
        await requirePermission(user, "manage_team");
        for (const firmId of firmIds) {
          await prisma.crmStageRow.update({ where: { firmId }, data: { ownerId: body.ownerId } });
        }
        return NextResponse.json({ updated: firmIds.length });
      }
      case "delete": {
        await requirePermission(user, "edit_firms");
        await prisma.firm.updateMany({ where: { id: { in: firmIds } }, data: { deletedAt: new Date(), deletedById: user.id } });
        return NextResponse.json({ updated: firmIds.length });
      }
      case "find_similar": {
        await requirePermission(user, "run_populate");
        const results = [];
        for (const firmId of firmIds) {
          const result = await runPopulate({ mode: "similar_to_firm", seedFirmId: firmId, triggeredById: user.id });
          results.push(result);
        }
        return NextResponse.json({ results });
      }
      default:
        return NextResponse.json({ error: "Unknown bulk action" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
}
