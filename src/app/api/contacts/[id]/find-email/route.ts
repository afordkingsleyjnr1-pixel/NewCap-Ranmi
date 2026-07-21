import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { findEmail } from "@/lib/services/hunter";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_contacts");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const contact = await prisma.contact.findUniqueOrThrow({ where: { id }, include: { firm: true } });

  if (!contact.firm.domain) {
    return NextResponse.json({ error: "Firm has no resolved domain." }, { status: 400 });
  }

  const [first, ...rest] = contact.name.split(" ");
  const last = rest.join(" ") || first;

  try {
    const result = await findEmail({ domain: contact.firm.domain, firstName: first, lastName: last });
    const updated = await prisma.contact.update({
      where: { id },
      data: { email: result.email, emailStatus: result.status, emailSource: result.source },
    });
    if (result.email) {
      await prisma.researchSource.create({
        data: { entityType: "contact", entityId: id, fieldName: "email", sourceUrlOrDescription: result.source },
      });
    }
    return NextResponse.json({ contact: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Hunter.io lookup failed" }, { status: 500 });
  }
}
