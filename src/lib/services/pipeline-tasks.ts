import { prisma } from "@/lib/db";
import { TASK_TITLES } from "@/lib/crm-stages";

/** Creates the pending-action task for a stage transition, if one doesn't already exist open. */
export async function createPendingTask(firmId: string, firmName: string, kind: keyof typeof TASK_TITLES) {
  const title = TASK_TITLES[kind](firmName);
  const existing = await prisma.task.findFirst({ where: { firmId, title, status: "open" } });
  if (existing) return existing;
  return prisma.task.create({ data: { firmId, title, status: "open", isFromTemplate: true } });
}

/** Marks the pending-action task for a stage done — the action was just completed. */
export async function completePendingTask(firmId: string, firmName: string, kind: keyof typeof TASK_TITLES) {
  const title = TASK_TITLES[kind](firmName);
  await prisma.task.updateMany({ where: { firmId, title, status: "open" }, data: { status: "done", completedAt: new Date() } });
}
