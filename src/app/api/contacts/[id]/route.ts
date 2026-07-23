import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_contacts");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const body = await req.json();
  const editable = ["name", "title", "email", "emailStatus", "emailSource", "alternateEmails", "linkedinUrl", "rank", "isPrimaryBdContact"];
  const data: Record<string, unknown> = {};
  for (const f of editable) if (f in body) data[f] = body[f];
  const contact = await prisma.contact.update({ where: { id }, data });
  return NextResponse.json({ contact });
}

// Section 5.1 — Remove: hard delete if contact has zero history, otherwise soft delete.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_contacts");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;

  const [threadCount, meetingCount] = await Promise.all([
    prisma.emailThread.count({ where: { contactId: id } }),
    prisma.meeting.count({ where: { contactId: id } }),
  ]);

  if (threadCount === 0 && meetingCount === 0) {
    await prisma.researchSource.deleteMany({ where: { entityType: "contact", entityId: id } });
    await prisma.activityLog.deleteMany({ where: { contactId: id, deletable: true } });
    await prisma.contact.delete({ where: { id } });
    return NextResponse.json({ deleted: "hard" });
  }

  await prisma.contact.update({ where: { id }, data: { removedAt: new Date() } });
  return NextResponse.json({ deleted: "soft" });
}
