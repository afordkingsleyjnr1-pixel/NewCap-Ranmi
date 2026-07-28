"use client";

import { Button } from "@/components/ui/button";
import { nextStepForFirm, type CrmStageKey } from "@/lib/crm-stages";

interface NextStepFirm {
  id: string;
  name: string;
  crmStage: { stage: CrmStageKey } | null;
  tasks: Array<{ title: string }>;
  meetings: Array<{ id: string; endTime: string; status: string }>;
}

/**
 * Shared Next Step cell — used by the Firms Database grid, CRM list view,
 * and Contacts view so the "one required action per stage" logic lives in
 * exactly one place. Clicking dispatches to whichever modal the parent page
 * owns for that action.
 */
export function NextStepCell({
  firm,
  onAction,
}: {
  firm: NextStepFirm;
  onAction: (firmId: string, action: NonNullable<ReturnType<typeof nextStepForFirm>["action"]>, meetingId?: string, firmName?: string) => void;
}) {
  if (!firm.crmStage) return <span className="text-text-secondary">—</span>;
  const { label, action } = nextStepForFirm(firm.crmStage.stage, firm.tasks, firm.meetings);

  if (!action) {
    return <span className="text-xs text-text-secondary">{label}</span>;
  }

  const meetingId = firm.meetings.find((m) => m.status === "scheduled")?.id;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={(e) => {
        e.stopPropagation();
        onAction(firm.id, action, meetingId, firm.name);
      }}
    >
      {label}
    </Button>
  );
}
