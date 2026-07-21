import { prisma } from "@/lib/db";

export async function getAppSettings() {
  const existing = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.appSettings.create({ data: { id: 1 } });
}
