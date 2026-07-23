import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, firmScopeWhere, ForbiddenError } from "@/lib/authz";
import { TASK_TITLES } from "@/lib/crm-stages";

// Section 5.9 step 4 — Projects view: every open task across every firm, sorted by due date.
// Optional ?projectId= scopes to one project's tasks (used by the Project dashboard).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const scope = await firmScopeWhere(user);
  const projectId = req.nextUrl.searchParams.get("projectId");
  const tasks = await prisma.task.findMany({
    where: { firm: { deletedAt: null, ...scope }, ...(projectId ? { projectId } : {}) },
    include: { firm: true, owner: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });
  return NextResponse.json({ tasks });
}

// Body: { firmId, title?, description?, dueDate?, ownerId?, projectId?, kind? }
// `kind` (one of TASK_TITLES: send_email / send_follow_up / schedule_meeting /
// send_term_sheet) creates the same system pending-action task the CRM Next
// Step engine creates automatically — so adding e.g. a "Send Email" task from
// within a project is indistinguishable from one the pipeline generated, and
// completing it (via the existing Next Step buttons) still drives the firm's
// CRM stage forward. Omit `kind` for a plain ad hoc task (Add Note, custom).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_tasks");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const body = await req.json();

  let title: string = body.title;
  let isFromTemplate = false;
  if (body.kind && body.kind in TASK_TITLES) {
    const firm = await prisma.firm.findUniqueOrThrow({ where: { id: body.firmId } });
    title = TASK_TITLES[body.kind as keyof typeof TASK_TITLES](firm.name);
    isFromTemplate = true;
  }
  if (!title?.trim()) return NextResponse.json({ error: "Task title is required" }, { status: 400 });

  const task = await prisma.task.create({
    data: {
      firmId: body.firmId,
      projectId: body.projectId ?? null,
      title,
      description: body.description ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      isFromTemplate,
      ownerId: body.ownerId ?? user!.id,
    },
  });
  return NextResponse.json({ task });
}
