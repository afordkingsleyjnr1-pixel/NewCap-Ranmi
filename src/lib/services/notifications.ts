import { prisma } from "@/lib/db";
import type { NotificationType } from "@/generated/prisma";

// Section 4.15 / 5.14 — the one shared notification mechanism every feature writes to.
export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  body: string;
  relatedFirmId?: string | null;
}) {
  return prisma.notification.create({
    data: { userId: params.userId, type: params.type, body: params.body, relatedFirmId: params.relatedFirmId ?? null },
  });
}
