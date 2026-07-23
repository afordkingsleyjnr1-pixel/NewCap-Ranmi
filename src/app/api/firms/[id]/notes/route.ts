import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";

// Manual note — shows up in the firm's Activity tab. Deletable, unlike the
// system-generated activity log entries (stage changes, emails sent, etc.).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_tasks");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id: firmId } = await params;
  const { body } = (await req.json()) as { body: string };
  if (!body?.trim()) return NextResponse.json({ error: "Note text is required" }, { status: 400 });

  const note = await prisma.activityLog.create({
    data: { firmId, type: "note", body: body.trim(), createdById: user!.id, deletable: true },
  });
  return NextResponse.json({ note });
}
