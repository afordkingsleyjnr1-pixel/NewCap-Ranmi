import { prisma } from "@/lib/db";

export async function getMandateSettings() {
  const existing = await prisma.mandateSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.mandateSettings.create({ data: { id: 1 } });
}

export function deriveWithinMandate(
  aumValue: number | null,
  band: { aumMin: number; aumMax: number }
): "yes" | "no" | "unconfirmed" {
  if (aumValue === null || aumValue === undefined) return "unconfirmed";
  return aumValue >= band.aumMin && aumValue <= band.aumMax ? "yes" : "no";
}

/** Section 4.6 — recompute within_mandate for every firm whose flag isn't manually overridden. */
export async function recomputeMandateForAllFirms() {
  const band = await getMandateSettings();
  const firms = await prisma.firm.findMany({
    where: { withinMandateManual: false, deletedAt: null },
    select: { id: true, aumValue: true },
  });
  let updated = 0;
  for (const firm of firms) {
    const value = firm.aumValue ? Number(firm.aumValue) : null;
    const nextFlag = deriveWithinMandate(value, { aumMin: Number(band.aumMin), aumMax: Number(band.aumMax) });
    await prisma.firm.update({ where: { id: firm.id }, data: { withinMandate: nextFlag } });
    updated++;
  }
  return updated;
}
