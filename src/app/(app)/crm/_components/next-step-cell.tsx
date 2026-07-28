"use client";

import { Button } from "@/components/ui/button";
import { nextStepForFirm, type CrmStageKey } from "@/lib/crm-stages";

interface NextStepFirm {
  id: string;
  name: string;
  stage: { stage: CrmStageKey } | null;
  tasks: Array<{ title: string }>;
  meetings: Array<{ id: string; endTime: string; status: string }>;
}

/**
 * Shared Next Step cell — used by the Entities Database grid, CRM list view,
 * and Contacts view so the "one required action per stage" logic lives in
 * exactly one place. Clicking dispatches to whichever modal the parent page
 * owns for that action.
 */
export function NextStepCell({
  entity,
  onAction,
}: {
  entity: NextStepFirm;
  onAction: (entityId: string, action: NonNullable<ReturnType<typeof nextStepForFirm>["action"]>, meetingId?: string, firmName?: string) => void;
}) {
  if (!entity.stage) return <span className="text-text-secondary">—</span>;
  const { label, action } = nextStepForFirm(entity.stage.stage, entity.tasks, entity.meetings);

  if (!action) {
    return <span className="text-xs text-text-secondary">{label}</span>;
  }

  const meetingId = entity.meetings.find((m) => m.status === "scheduled")?.id;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={(e) => {
        e.stopPropagation();
        onAction(entity.id, action, meetingId, entity.name);
      }}
    >
      {label}
    </Button>
  );
}
