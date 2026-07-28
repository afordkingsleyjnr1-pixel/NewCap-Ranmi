import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const comments = await prisma.taskComment.findMany({
    where: { taskId: id },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_tasks");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const body = await req.json();
  const text = String(body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });

  const comment = await prisma.taskComment.create({
    data: { taskId: id, body: text, createdById: user!.id },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ comment });
}
