"use client";

import { useCallback, useEffect, useState } from "react";
import { Kanban } from "./_components/kanban";
import { NextStepCell } from "./_components/next-step-cell";
import { useNextStepActions } from "./_components/use-next-step-actions";
import { FirmDrawer } from "../entities/_components/entity-drawer";
import { KanbanSquare, List } from "lucide-react";
import { Pill } from "@/components/ui/badge";
import { STAGE_LABELS, STAGE_COLORS } from "@/lib/crm-stages";
import type { FirmListItem } from "@/lib/types";

export default function CrmPage() {
  const [entities, setFirms] = useState<FirmListItem[]>([]);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [openFirmId, setOpenFirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/entities");
    const data = await res.json();
    setFirms(data.entities ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { handleAction, modals } = useNextStepActions(load);

  async function handleStageChange(entityId: string, stage: string) {
    await fetch(`/api/crm/${entityId}/stage`, { method: "PATCH", body: JSON.stringify({ stage }) });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">CRM Pipeline</h1>
          <p className="text-sm text-text-secondary">{entities.length} entities in the pipeline</p>
        </div>
        <div className="flex gap-1 rounded-md border border-border bg-page p-1">
          <button
            onClick={() => setView("kanban")}
            className={`rounded px-2.5 py-1.5 text-xs font-medium ${view === "kanban" ? "bg-primary text-white" : "text-text-secondary"}`}
          >
            <KanbanSquare className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setView("list")}
            className={`rounded px-2.5 py-1.5 text-xs font-medium ${view === "list" ? "bg-primary text-white" : "text-text-secondary"}`}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {view === "kanban" ? (
        <Kanban entities={entities} onOpen={setOpenFirmId} onAction={handleAction} onStageChange={handleStageChange} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Current Stage</th>
                <th>Next Step</th>
                <th>Pending Task</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {[...entities]
                .sort((a, b) => {
                  const ad = a.stage?.nextFollowUpDate ? new Date(a.stage.nextFollowUpDate).getTime() : Infinity;
                  const bd = b.stage?.nextFollowUpDate ? new Date(b.stage.nextFollowUpDate).getTime() : Infinity;
                  return ad - bd;
                })
                .map((f) => {
                  const stage = f.stage?.stage;
                  return (
                    <tr key={f.id} onClick={() => setOpenFirmId(f.id)}>
                      <td className="font-medium text-text-primary">{f.name}</td>
                      <td>{stage && <Pill color={STAGE_COLORS[stage]}>{STAGE_LABELS[stage]}</Pill>}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <NextStepCell entity={f} onAction={handleAction} />
                      </td>
                      <td className="text-text-secondary">{f.tasks[0] ? f.tasks[0].title.split(" — ")[0] : "—"}</td>
                      <td className="text-text-secondary">{f.stage?.owner?.name ?? "Unassigned"}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      <FirmDrawer entityId={openFirmId} onClose={() => setOpenFirmId(null)} onChanged={load} />
      {modals}
    </div>
  );
}
