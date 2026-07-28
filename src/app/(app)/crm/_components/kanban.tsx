"use client";

import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from "@dnd-kit/core";
import { CRM_STAGES, STAGE_LABELS, STAGE_COLORS, nextStepForFirm, type StageAction } from "@/lib/crm-stages";
import { Pill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FirmListItem } from "@/lib/types";

type ActionHandler = (entityId: string, action: NonNullable<StageAction>, meetingId?: string, firmName?: string) => void;

function KanbanCard({ entity, onOpen, onAction }: { entity: FirmListItem; onOpen: () => void; onAction: ActionHandler }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: entity.id });
  const stage = entity.stage?.stage;
  const isDoNotContact = stage === "do_not_contact";
  const { label, action } = stage ? nextStepForFirm(stage, entity.tasks, entity.meetings) : { label: "—", action: null };
  const meetingId = entity.meetings.find((m) => m.status === "scheduled")?.id;

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
      <p className="text-sm font-medium text-text-primary">{entity.name}</p>
      <p className="mt-0.5 text-xs text-text-secondary">{entity.hqLocation ?? "—"}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text-primary">{entity.aumDisplay ?? "NA"}</span>
        {entity.stage?.nextFollowUpDate && (
          <span className="text-xs text-status-amber">Follow up {new Date(entity.stage.nextFollowUpDate).toLocaleDateString()}</span>
        )}
      </div>
      {action && !isDoNotContact ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 w-full"
          onClick={(e) => {
            e.stopPropagation();
            onAction(entity.id, action, meetingId, entity.name);
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

function KanbanColumn({ stage, entities, onOpen, onAction }: { stage: (typeof CRM_STAGES)[number]; entities: FirmListItem[]; onOpen: (id: string) => void; onAction: ActionHandler }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div ref={setNodeRef} className={cn("flex w-72 shrink-0 flex-col rounded-lg border border-border bg-page", isOver && "ring-2 ring-accent")}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <Pill color={STAGE_COLORS[stage]}>{STAGE_LABELS[stage]}</Pill>
        <span className="text-xs font-medium text-text-secondary">{entities.length}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 260px)" }}>
        {entities.map((f) => (
          <KanbanCard key={f.id} entity={f} onOpen={() => onOpen(f.id)} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}

export function Kanban({
  entities,
  onOpen,
  onAction,
  onStageChange,
}: {
  entities: FirmListItem[];
  onOpen: (id: string) => void;
  onAction: ActionHandler;
  onStageChange: (id: string, stage: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const entityId = active.id as string;
    const newStage = over.id as string;
    const entity = entities.find((f) => f.id === entityId);
    if (entity?.stage?.stage === "do_not_contact") return; // hard stop, Section 5.6
    if (entity?.stage?.stage !== newStage) onStageChange(entityId, newStage);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {CRM_STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            entities={entities.filter((f) => f.stage?.stage === stage)}
            onOpen={onOpen}
            onAction={onAction}
          />
        ))}
      </div>
    </DndContext>
  );
}
