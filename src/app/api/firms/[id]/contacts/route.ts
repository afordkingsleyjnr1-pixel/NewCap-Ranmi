import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";

// Manual contact entry — the research pipeline / Find Contact can come back
// empty for firms with no public team page (common for small, private
// managers), and until now there was no way to add a contact the user
// already knows about by hand.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_contacts");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const existingCount = await prisma.contact.count({ where: { firmId: id, removedAt: null } });
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;

  const contact = await prisma.contact.create({
    data: {
      firmId: id,
      name,
      title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : null,
      email,
      emailStatus: email ? "verified" : "unknown",
      emailSource: email ? "manual" : null,
      linkedinUrl: typeof body.linkedinUrl === "string" && body.linkedinUrl.trim() ? body.linkedinUrl.trim() : null,
      rank: existingCount + 1,
      isPrimaryBdContact: existingCount === 0,
    },
  });

  return NextResponse.json({ contact });
}
