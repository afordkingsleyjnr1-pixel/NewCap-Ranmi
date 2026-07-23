import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, projectScopeWhere, ForbiddenError } from "@/lib/authz";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const scope = await projectScopeWhere(user);

  const projects = await prisma.project.findMany({
    where: scope,
    include: {
      owner: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      firms: { select: { firmId: true } },
      tasks: { select: { id: true, status: true, dueDate: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ projects });
}

// Section: Projects Module step 1 — Create Project.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_tasks");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const { name, description, type, startDate, dueDate, ownerId } = body as {
    name: string;
    description?: string;
    type?: string;
    startDate: string;
    dueDate?: string;
    ownerId?: string;
  };

  if (!name?.trim()) return NextResponse.json({ error: "Project name is required" }, { status: 400 });
  if (!startDate) return NextResponse.json({ error: "Start date is required" }, { status: 400 });

  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      description: description || null,
      type: type || null,
      startDate: new Date(startDate),
      dueDate: dueDate ? new Date(dueDate) : null,
      ownerId: ownerId || user!.id,
      members: { create: { userId: ownerId || user!.id } },
    },
    include: { owner: { select: { id: true, name: true } }, members: { include: { user: { select: { id: true, name: true, email: true } } } } },
  });

  return NextResponse.json({ project });
}
