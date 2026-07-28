// The generic pipeline engine. Replaces the old hardcoded crm-stages.ts
// switch statement — every project defines its own ordered PipelineStage
// list (prisma model `PipelineStage`), and the automation that used to be
// baked into source code per literal stage name (auto follow-up tasks, the
// Next Step suggestion, an auto-generated closing checklist, Do-Not-Contact
// as a one-way terminal stage) is now expressed as data on each stage row:
// `autoTaskTitle`, `autoChecklist`, `isTerminal`, `positiveNextStageId`/
// `negativeNextStageId`.
import { prisma } from "@/lib/db";
import type { PipelineStage } from "@/generated/prisma";

export type StageColor = string;

export interface OpenTaskRef {
  title: string;
}

export interface NextStepInfo {
  label: string;
  /** Null when there's nothing actionable right now. */
  action: "run_auto_task" | "review_meeting" | null;
  /** The task title to create/complete for `run_auto_task`. */
  taskTitle?: string;
}

/**
 * The generic Next Step engine — two rules replace the old 13-case switch:
 *  1. If the stage defines an `autoTaskTitle` and no open task with that
 *     title exists yet, the next step is to complete that task.
 *  2. Otherwise, if the entity has a scheduled meeting whose end time has
 *     passed, the next step is to log the meeting outcome.
 *  3. Otherwise there's nothing to prompt for (awaiting a reply, terminal
 *     stage, etc).
 */
export function computeNextStep(
  stage: Pick<PipelineStage, "autoTaskTitle" | "isTerminal">,
  openTasks: OpenTaskRef[],
  meetingOverdue: boolean
): NextStepInfo {
  if (stage.isTerminal) {
    return { label: "—", action: null };
  }
  if (stage.autoTaskTitle) {
    const pending = openTasks.some((t) => t.title.startsWith(stage.autoTaskTitle!));
    if (pending) {
      return { label: stage.autoTaskTitle, action: "run_auto_task", taskTitle: stage.autoTaskTitle };
    }
  }
  if (meetingOverdue) {
    return { label: "Update Meeting Outcome", action: "review_meeting" };
  }
  return { label: "Awaiting Next Action", action: null };
}

/** Convenience wrapper: derives meetingOverdue from an entity's most recent scheduled meeting. */
export function nextStepForEntity(
  stage: Pick<PipelineStage, "autoTaskTitle" | "isTerminal">,
  openTasks: OpenTaskRef[],
  meetings: Array<{ endTime: string | Date; status: string }>
): NextStepInfo {
  const scheduled = meetings.find((m) => m.status === "scheduled");
  const meetingOverdue = !!scheduled && new Date(scheduled.endTime) < new Date();
  return computeNextStep(stage, openTasks, meetingOverdue);
}

/**
 * Applies a stage's auto-task/auto-checklist side effects. Idempotent —
 * only creates a task if no open task with the same title already exists,
 * same guarantee the old hardcoded term_sheet_sent/closing-checklist logic
 * gave.
 */
export async function applyStageEntrySideEffects(entityId: string, stage: PipelineStage) {
  const titles = [
    ...(stage.autoTaskTitle ? [stage.autoTaskTitle] : []),
    ...stage.autoChecklist,
  ];
  if (titles.length === 0) return;

  const existing = await prisma.task.findMany({
    where: { entityId, title: { in: titles }, status: "open" },
    select: { title: true },
  });
  const existingTitles = new Set(existing.map((t) => t.title));

  const toCreate = titles.filter((t) => !existingTitles.has(t));
  if (toCreate.length === 0) return;

  await prisma.task.createMany({
    data: toCreate.map((title) => ({
      entityId,
      title,
      isFromTemplate: true,
      status: "open" as const,
    })),
  });
}

/** Fetches a project's pipeline stages ordered for kanban/select rendering. */
export function getProjectPipeline(projectId: string) {
  return prisma.pipelineStage.findMany({ where: { projectId }, orderBy: { order: "asc" } });
}

/**
 * Moves an entity to `nextStageId`, enforcing the one-way terminal rule
 * server-side (generalizes the old Do-Not-Contact client-only guard).
 * Throws if the entity's current stage is terminal.
 */
export async function moveEntityStage(entityId: string, nextStageId: string) {
  const current = await prisma.entityStage.findUnique({
    where: { entityId },
    include: { stage: true },
  });
  if (current?.stage.isTerminal) {
    throw new Error("TERMINAL_STAGE");
  }
  const nextStage = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: nextStageId } });

  const updated = await prisma.entityStage.upsert({
    where: { entityId },
    update: { stageId: nextStage.id, stageChangedAt: new Date() },
    create: { entityId, stageId: nextStage.id },
  });

  await prisma.activityLog.create({
    data: { entityId, type: "stage_change", body: `Stage changed to "${nextStage.label}"` },
  });

  await applyStageEntrySideEffects(entityId, nextStage);
  return updated;
}

/**
 * Generic "log outcome" action — replaces the old hardcoded
 * interested/not_interested branch in /api/crm/[id]/respond. Moves the
 * entity to the stage's configured positive/negative next stage, if any.
 */
export async function logStageOutcome(entityId: string, outcome: "positive" | "negative") {
  const current = await prisma.entityStage.findUniqueOrThrow({
    where: { entityId },
    include: { stage: true },
  });
  const nextStageId = outcome === "positive" ? current.stage.positiveNextStageId : current.stage.negativeNextStageId;
  if (!nextStageId) return null;
  return moveEntityStage(entityId, nextStageId);
}
