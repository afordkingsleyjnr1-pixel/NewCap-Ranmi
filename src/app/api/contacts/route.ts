import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { firmScopeWhere } from "@/lib/authz";
import type { Prisma } from "@/generated/prisma";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage");
  const emailStatus = searchParams.get("emailStatus");
  const search = searchParams.get("q");

  const scope = await firmScopeWhere(user);

  const firmFilter: Prisma.FirmWhereInput = { deletedAt: null, ...scope };
  if (stage) firmFilter.crmStage = { stage: stage as never };

  const where: Prisma.ContactWhereInput = {
    removedAt: null,
    firm: firmFilter,
  };
  if (emailStatus) where.emailStatus = emailStatus as never;
  if (search) where.name = { contains: search, mode: "insensitive" };

  const contacts = await prisma.contact.findMany({
    where,
    include: {
      firm: {
        include: {
          crmStage: true,
          tasks: { where: { status: "open" }, orderBy: { createdAt: "asc" } },
          meetings: { where: { status: "scheduled" }, orderBy: { startTime: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { name: "asc" },
    take: 1000,
  });

  return NextResponse.json({ contacts });
}
