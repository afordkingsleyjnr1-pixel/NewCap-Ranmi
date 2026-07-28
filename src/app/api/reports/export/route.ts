import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, firmScopeWhere, ForbiddenError } from "@/lib/authz";

function toCsvValue(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "export_data");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const scope = await firmScopeWhere(user!);
  const entities = await prisma.entity.findMany({
    where: { deletedAt: null, ...scope },
    include: {
      stage: { include: { owner: { select: { id: true, name: true } } } },
      contacts: { where: { removedAt: null }, orderBy: { rank: "asc" }, take: 1 },
    },
  });

  const headers = ["Entity Name", "HQ", "Strategies", "Focus Areas", "AUM", "Within Mandate", "CRM Stage", "Owner", "Primary Contact", "Email", "Email Status"];
  const rows = entities.map((f: any) => [
    f.name,
    f.hqLocation ?? "",
    Object.keys(f.strategies as Record<string, string[]>).join("; "),
    Object.keys(f.focusAreas as Record<string, string[]>).join("; "),
    f.aumDisplay ?? "NA",
    f.withinMandate,
    f.stage?.stage ?? "",
    f.stage?.owner?.name ?? "",
    f.contacts[0]?.name ?? "",
    f.contacts[0]?.email ?? "",
    f.contacts[0]?.emailStatus ?? "",
  ]);

  const csv = [headers, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="entities-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
