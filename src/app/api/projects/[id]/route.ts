import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";

// Section: Projects Module step 8 — Project Dashboard: details, members,
// firms, open/completed tasks, upcoming deadlines, recent activity — all in
// one payload.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      members: { include: { user: { select: { id: true, name: true, email: true, status: true } } }, orderBy: { addedAt: "asc" } },
      firms: {
        include: {
          firm: {
            include: {
              crmStage: { include: { owner: { select: { id: true, name: true } } } },
              contacts: { where: { removedAt: null }, orderBy: { rank: "asc" } },
              tasks: { where: { status: "open" } },
              meetings: { where: { status: "scheduled" }, take: 1 },
            },
          },
        },
      },
      tasks: {
        include: { owner: { select: { id: true, name: true } }, firm: { select: { id: true, name: true } } },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      },
    },
  });

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const firmIds = project.firms.map((f: { firmId: string }) => f.firmId);
  const recentActivity = firmIds.length
    ? await prisma.activityLog.findMany({
        where: { firmId: { in: firmIds } },
        include: { createdBy: { select: { id: true, name: true } }, firm: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      })
    : [];

  return NextResponse.json({ project, recentActivity });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_tasks");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  const editable = ["name", "description", "type", "status", "ownerId"];
  for (const f of editable) if (f in body) data[f] = body[f];
  if ("startDate" in body) data.startDate = new Date(body.startDate);
  if ("dueDate" in body) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  const project = await prisma.project.update({ where: { id }, data });
  return NextResponse.json({ project });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_tasks");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;

  // Unlink tasks rather than deleting them — they still belong to their firm
  // and remain in the main Tasks module.
  await prisma.$transaction([
    prisma.task.updateMany({ where: { projectId: id }, data: { projectId: null } }),
    prisma.projectFirm.deleteMany({ where: { projectId: id } }),
    prisma.projectMember.deleteMany({ where: { projectId: id } }),
    prisma.project.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
