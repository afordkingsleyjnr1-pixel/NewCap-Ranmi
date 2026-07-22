import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, firmScopeWhere, ForbiddenError } from "@/lib/authz";
import { findDuplicate } from "@/lib/services/dedupe";
import { runFirmResearchPipeline } from "@/lib/services/firm-pipeline";
import { Prisma } from "@/generated/prisma";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const strategyParent = searchParams.get("strategyParent");
  const focusParent = searchParams.get("focusParent");
  const stage = searchParams.get("stage");
  const sourceType = searchParams.get("sourceType");
  const classificationStatus = searchParams.get("classificationStatus");
  const domainResolutionStatus = searchParams.get("domainResolutionStatus");
  const hqRegion = searchParams.get("hqRegion");
  const withinMandate = searchParams.get("withinMandate");
  const similarToFirmId = searchParams.get("similarTo");
  const search = searchParams.get("q");
  const includeDeleted = searchParams.get("includeDeleted") === "true";

  const scope = await firmScopeWhere(user);

  const where: Prisma.FirmWhereInput = {
    ...scope,
    deletedAt: includeDeleted ? undefined : null,
  };

  if (search) where.name = { contains: search, mode: "insensitive" };
  if (sourceType) where.sourceType = sourceType as Prisma.EnumSourceTypeFilter["equals"];
  if (classificationStatus) where.classificationStatus = classificationStatus as never;
  if (domainResolutionStatus) where.domainResolutionStatus = domainResolutionStatus as never;
  if (withinMandate) where.withinMandate = withinMandate as never;
  if (hqRegion) where.hqLocation = { contains: hqRegion, mode: "insensitive" };
  if (similarToFirmId) where.similarTo = { has: similarToFirmId };
  if (strategyParent) where.strategies = { path: [strategyParent], not: Prisma.JsonNull } as never;
  if (focusParent) where.focusAreas = { path: [focusParent], not: Prisma.JsonNull } as never;
  if (stage) where.crmStage = { stage: stage as never };

  const firms = await prisma.firm.findMany({
    where,
    include: {
      crmStage: { include: { owner: { select: { id: true, name: true } } } },
      contacts: { where: { removedAt: null }, orderBy: { rank: "asc" }, take: 1 },
      tasks: { where: { status: "open" }, orderBy: { createdAt: "asc" } },
      meetings: { where: { status: "scheduled" }, orderBy: { startTime: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // Relevant Notifications — unread count per firm, for the grid's alert indicator.
  const unreadCounts = await prisma.notification.groupBy({
    by: ["relatedFirmId"],
    where: { userId: user.id, isRead: false, relatedFirmId: { in: firms.map((f) => f.id) } },
    _count: { _all: true },
  });
  const unreadByFirm = new Map(unreadCounts.map((c) => [c.relatedFirmId, c._count._all]));

  const firmsWithAlerts = firms.map((f) => ({ ...f, unreadNotifications: unreadByFirm.get(f.id) ?? 0 }));

  return NextResponse.json({ firms: firmsWithAlerts });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "edit_firms");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const namesRaw: string = body.names ?? "";
  const names = String(namesRaw)
    .split(/[\n,]/)
    .map((n) => n.trim())
    .filter(Boolean);

  if (names.length === 0) {
    return NextResponse.json({ error: "Provide at least one firm name" }, { status: 400 });
  }

  const added: { id: string; name: string }[] = [];
  const needsDomainConfirmation: { id: string; name: string }[] = [];
  const skippedDuplicates: string[] = [];
  const researchWarnings: string[] = [];
  const failed: string[] = [];

  for (const name of names) {
    const dup = await findDuplicate({ name });
    if (dup) {
      skippedDuplicates.push(`${name} (matches existing "${dup.name}")`);
      continue;
    }

    try {
      const outcome = await runFirmResearchPipeline({ name, sourceType: "manual_add" });
      if (outcome.domainResolutionStatus === "resolved") {
        added.push({ id: outcome.firmId, name: outcome.name });
      } else {
        needsDomainConfirmation.push({ id: outcome.firmId, name: outcome.name });
      }
      if (outcome.researchWarning) {
        researchWarnings.push(`${name}: ${outcome.researchWarning}`);
      }
    } catch (e) {
      // A step failing shouldn't take down the whole batch — one bad name
      // (or a full API outage) still lets the rest of the list get added.
      failed.push(`${name}: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }

  return NextResponse.json({
    summary: {
      addedCount: added.length,
      needsDomainConfirmationCount: needsDomainConfirmation.length,
      skippedDuplicateCount: skippedDuplicates.length,
    },
    added,
    needsDomainConfirmation,
    skippedDuplicates,
    researchWarnings,
    failed,
  });
}
