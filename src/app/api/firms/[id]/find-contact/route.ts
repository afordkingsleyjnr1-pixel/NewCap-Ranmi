import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { discoverContacts } from "@/lib/services/contact-discovery";
import { findEmail, isHunterConfigured } from "@/lib/services/hunter";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_contacts");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const firm = await prisma.firm.findUniqueOrThrow({ where: { id } });

  if (!firm.domain) {
    return NextResponse.json(
      { error: "Firm has no resolved domain. Confirm the domain in the drawer before running Find Contact." },
      { status: 400 }
    );
  }

  const discovered = await discoverContacts({ firmName: firm.name, domain: firm.domain });
  const created = [];

  for (const c of discovered) {
    const contact = await prisma.contact.create({
      data: { firmId: id, name: c.name, title: c.title, linkedinUrl: c.linkedinUrl, rank: c.rank, isPrimaryBdContact: c.rank === 1 },
    });
    if (c.sourceDescription) {
      await prisma.researchSource.create({
        data: { entityType: "contact", entityId: contact.id, fieldName: "name_title", sourceUrlOrDescription: c.sourceDescription },
      });
    }

    if (await isHunterConfigured()) {
      const [first, ...rest] = c.name.split(" ");
      const last = rest.join(" ") || first;
      try {
        const emailResult = await findEmail({ domain: firm.domain, firstName: first, lastName: last });
        if (emailResult.email) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: { email: emailResult.email, emailStatus: emailResult.status, emailSource: emailResult.source },
          });
        }
      } catch {
        // non-fatal
      }
    }
    created.push(contact);
  }

  return NextResponse.json({ contacts: created });
}
