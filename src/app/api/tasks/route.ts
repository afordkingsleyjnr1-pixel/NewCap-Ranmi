import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, firmScopeWhere, ForbiddenError } from "@/lib/authz";

// Section 5.9 step 4 — Projects view: every open task across every firm, sorted by due date.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const scope = await firmScopeWhere(user);
  const tasks = await prisma.task.findMany({
    where: { firm: { deletedAt: null, ...scope } },
    include: { firm: true, owner: { select: { id: true, name: true } } },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });
  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_tasks");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const body = await req.json();
  const task = await prisma.task.create({
    data: {
      firmId: body.firmId,
      title: body.title,
      description: body.description ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      isFromTemplate: false,
      ownerId: user!.id,
    },
  });
  return NextResponse.json({ task });
}
