import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";

// Section: Projects Module step 3 — Add Firms to a Project (one or many).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_tasks");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id: projectId } = await params;
  const { firmIds } = (await req.json()) as { firmIds: string[] };
  if (!Array.isArray(firmIds) || firmIds.length === 0) {
    return NextResponse.json({ error: "Provide at least one firm" }, { status: 400 });
  }

  await prisma.projectFirm.createMany({
    data: firmIds.map((firmId) => ({ projectId, firmId })),
    skipDuplicates: true,
  });

  return NextResponse.json({ ok: true });
}
