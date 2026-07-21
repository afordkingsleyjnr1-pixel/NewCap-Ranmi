"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kanban } from "./_components/kanban";
import { ComposeEmailModal } from "./_components/compose-email-modal";
import { ScheduleMeetingModal } from "./_components/schedule-meeting-modal";
import { FirmDrawer } from "../firms/_components/firm-drawer";
import { KanbanSquare, List } from "lucide-react";
import { Pill } from "@/components/ui/badge";
import { STAGE_LABELS, STAGE_COLORS, STAGE_ACTIONS, ACTION_LABELS } from "@/lib/crm-stages";
import type { FirmListItem } from "@/lib/types";

export default function CrmPage() {
  const [firms, setFirms] = useState<FirmListItem[]>([]);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [openFirmId, setOpenFirmId] = useState<string | null>(null);
  const [composeFirm, setComposeFirm] = useState<{ id: string; name: string; isFollowUp: boolean } | null>(null);
  const [meetingFirm, setMeetingFirm] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/firms");
    const data = await res.json();
    setFirms(data.firms ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStageChange(firmId: string, stage: string) {
    await fetch(`/api/crm/${firmId}/stage`, { method: "PATCH", body: JSON.stringify({ stage }) });
    load();
  }

  function handleAction(firmId: string, action: string) {
    const firm = firms.find((f) => f.id === firmId);
    if (!firm) return;
    if (action === "send_email") setComposeFirm({ id: firmId, name: firm.name, isFollowUp: false });
    if (action === "send_follow_up") setComposeFirm({ id: firmId, name: firm.name, isFollowUp: true });
    if (action === "schedule_meeting") setMeetingFirm({ id: firmId, name: firm.name });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">CRM Pipeline</h1>
          <p className="text-sm text-text-secondary">{firms.length} firms in the pipeline</p>
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
        <Kanban firms={firms} onOpen={setOpenFirmId} onAction={handleAction} onStageChange={handleStageChange} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>Firm</th>
                <th>Stage</th>
                <th>Next Follow-Up</th>
                <th>Owner</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {[...firms]
                .sort((a, b) => {
                  const ad = a.crmStage?.nextFollowUpDate ? new Date(a.crmStage.nextFollowUpDate).getTime() : Infinity;
                  const bd = b.crmStage?.nextFollowUpDate ? new Date(b.crmStage.nextFollowUpDate).getTime() : Infinity;
                  return ad - bd;
                })
                .map((f) => {
                  const stage = f.crmStage?.stage;
                  const action = stage ? STAGE_ACTIONS[stage] : null;
                  return (
                    <tr key={f.id} onClick={() => setOpenFirmId(f.id)}>
                      <td className="font-medium text-text-primary">{f.name}</td>
                      <td>{stage && <Pill color={STAGE_COLORS[stage]}>{STAGE_LABELS[stage]}</Pill>}</td>
                      <td className="text-text-secondary">
                        {f.crmStage?.nextFollowUpDate ? new Date(f.crmStage.nextFollowUpDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="text-text-secondary">{f.crmStage?.owner?.name ?? "Unassigned"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {action && (
                          <Button size="sm" variant="outline" onClick={() => handleAction(f.id, action)}>
                            {ACTION_LABELS[action]}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      <ComposeEmailModal
        open={!!composeFirm}
        onOpenChange={(o) => !o && setComposeFirm(null)}
        firmId={composeFirm?.id ?? null}
        firmName={composeFirm?.name}
        isFollowUp={!!composeFirm?.isFollowUp}
        onSent={load}
      />
      <ScheduleMeetingModal
        open={!!meetingFirm}
        onOpenChange={(o) => !o && setMeetingFirm(null)}
        firmId={meetingFirm?.id ?? null}
        firmName={meetingFirm?.name}
        onScheduled={load}
      />
      <FirmDrawer firmId={openFirmId} onClose={() => setOpenFirmId(null)} onChanged={load} />
    </div>
  );
}
