import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const entity = await prisma.entity.findUnique({
    where: { id },
    include: {
      contacts: { where: { removedAt: null }, orderBy: { rank: "asc" } },
      stage: { include: { owner: { select: { id: true, name: true } } } },
      activityLog: {
        orderBy: { createdAt: "desc" },
        include: { contact: true, createdBy: { select: { id: true, name: true } } },
      },
      tasks: { orderBy: { createdAt: "asc" } },
      meetings: { orderBy: { startTime: "desc" } },
      emailThreads: { include: { messages: true, contact: true }, orderBy: { lastActivityAt: "desc" } },
    },
  });

  if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  const similarFirms = entity.similarTo.length
    ? await prisma.entity.findMany({ where: { id: { in: entity.similarTo } }, select: { id: true, name: true, deletedAt: true } })
    : [];

  // research_sources is polymorphic (entity_type + entity_id, no real FK — see
  // schema comment), so it's fetched separately for the entity plus every one
  // of its contacts rather than via a Prisma relation.
  const contactIds = entity.contacts.map((c: { id: string }) => c.id);
  const researchSources = await prisma.researchSource.findMany({
    where: {
      OR: [
        { entityType: "entity", entityId: entity.id },
        ...(contactIds.length ? [{ entityType: "contact", entityId: { in: contactIds } }] : []),
      ],
    },
  });

  return NextResponse.json({ entity: { ...entity, researchSources }, similarFirms });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "edit_firms");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  const editableFields = [
    "domain",
    "hqLocation",
    "targetMarkets",
    "aumValue",
    "aumDisplay",
    "aumAsOf",
    "aumConfidence",
    "strategyDetail",
    "domainResolutionStatus",
  ];
  for (const f of editableFields) if (f in body) data[f] = body[f];

  // Manual classification edit — Section 5.4.
  if ("strategies" in body || "focusAreas" in body) {
    if ("strategies" in body) data.strategies = body.strategies;
    if ("focusAreas" in body) data.focusAreas = body.focusAreas;
    const entity = await prisma.entity.findUniqueOrThrow({ where: { id } });
    data.classificationSource = entity.classificationSource === "engine" ? "engine_then_edited" : "manual_override";
  }

  // Within-mandate manual override / clear (Section 4.1).
  if ("withinMandateOverride" in body) {
    data.withinMandate = body.withinMandateOverride;
    data.withinMandateManual = true;
  }
  if (body.clearWithinMandateOverride === true) {
    const { getMandateSettings, deriveWithinMandate } = await import("@/lib/services/mandate");
    const entity = await prisma.entity.findUniqueOrThrow({ where: { id } });
    const band = await getMandateSettings();
    data.withinMandate = deriveWithinMandate(entity.aumValue ? Number(entity.aumValue) : null, {
      aumMin: Number(band.aumMin),
      aumMax: Number(band.aumMax),
    });
    data.withinMandateManual = false;
  }

  // Owner assignment (Section 5.13 step 9).
  if ("ownerId" in body) {
    await prisma.entityStage.update({ where: { entityId: id }, data: { ownerId: body.ownerId } });
  }

  const entity = await prisma.entity.update({ where: { id }, data });
  return NextResponse.json({ entity });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "edit_firms");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;

  const entity = await prisma.entity.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: user!.id },
  });

  return NextResponse.json({ entity });
}
