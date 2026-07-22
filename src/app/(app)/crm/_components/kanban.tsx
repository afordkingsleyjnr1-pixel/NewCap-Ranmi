"use client";

import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from "@dnd-kit/core";
import { CRM_STAGES, STAGE_LABELS, STAGE_COLORS, nextStepForFirm, type StageAction } from "@/lib/crm-stages";
import { Pill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FirmListItem } from "@/lib/types";

type ActionHandler = (firmId: string, action: NonNullable<StageAction>, meetingId?: string, firmName?: string) => void;

function KanbanCard({ firm, onOpen, onAction }: { firm: FirmListItem; onOpen: () => void; onAction: ActionHandler }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: firm.id });
  const stage = firm.crmStage?.stage;
  const isDoNotContact = stage === "do_not_contact";
  const { label, action } = stage ? nextStepForFirm(stage, firm.tasks, firm.meetings) : { label: "—", action: null };
  const meetingId = firm.meetings.find((m) => m.status === "scheduled")?.id;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : undefined}
      className={cn(
        "cursor-grab rounded-md border border-border bg-surface p-3 shadow-sm hover:border-accent",
        isDragging && "opacity-60"
      )}
    >
      <p className="text-sm font-medium text-text-primary">{firm.name}</p>
      <p className="mt-0.5 text-xs text-text-secondary">{firm.hqLocation ?? "—"}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text-primary">{firm.aumDisplay ?? "NA"}</span>
        {firm.crmStage?.nextFollowUpDate && (
          <span className="text-xs text-status-amber">Follow up {new Date(firm.crmStage.nextFollowUpDate).toLocaleDateString()}</span>
        )}
      </div>
      {action && !isDoNotContact ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 w-full"
          onClick={(e) => {
            e.stopPropagation();
            onAction(firm.id, action, meetingId, firm.name);
          }}
        >
          {label}
        </Button>
      ) : (
        !isDoNotContact && <p className="mt-2 text-center text-xs text-text-secondary">{label}</p>
      )}
    </div>
  );
}

function KanbanColumn({ stage, firms, onOpen, onAction }: { stage: (typeof CRM_STAGES)[number]; firms: FirmListItem[]; onOpen: (id: string) => void; onAction: ActionHandler }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div ref={setNodeRef} className={cn("flex w-72 shrink-0 flex-col rounded-lg border border-border bg-page", isOver && "ring-2 ring-accent")}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <Pill color={STAGE_COLORS[stage]}>{STAGE_LABELS[stage]}</Pill>
        <span className="text-xs font-medium text-text-secondary">{firms.length}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 260px)" }}>
        {firms.map((f) => (
          <KanbanCard key={f.id} firm={f} onOpen={() => onOpen(f.id)} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}

export function Kanban({
  firms,
  onOpen,
  onAction,
  onStageChange,
}: {
  firms: FirmListItem[];
  onOpen: (id: string) => void;
  onAction: ActionHandler;
  onStageChange: (id: string, stage: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const firmId = active.id as string;
    const newStage = over.id as string;
    const firm = firms.find((f) => f.id === firmId);
    if (firm?.crmStage?.stage === "do_not_contact") return; // hard stop, Section 5.6
    if (firm?.crmStage?.stage !== newStage) onStageChange(firmId, newStage);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {CRM_STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            firms={firms.filter((f) => f.crmStage?.stage === stage)}
            onOpen={onOpen}
            onAction={onAction}
          />
        ))}
      </div>
    </DndContext>
  );
}
