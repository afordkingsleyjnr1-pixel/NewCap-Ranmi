"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Pill, TagPill } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, X, Sparkles, Bell } from "lucide-react";
import { STRATEGIES_TAXONOMY, FOCUS_AREAS_TAXONOMY } from "@/lib/taxonomy";
import { STAGE_LABELS, STAGE_COLORS, CRM_STAGES } from "@/lib/crm-stages";
import { AddFirmModal } from "./_components/add-firm-modal";
import { PopulateModal } from "./_components/populate-modal";
import { FirmDrawer } from "./_components/firm-drawer";
import { FirmContextMenu, type FirmContextMenuTarget } from "./_components/firm-context-menu";
import { AddToProjectModal } from "./_components/add-to-project-modal";
import { QuickAddTaskModal } from "./_components/quick-add-task-modal";
import { AddNoteModal } from "./_components/add-note-modal";
import { NextStepCell } from "../crm/_components/next-step-cell";
import { useNextStepActions } from "../crm/_components/use-next-step-actions";
import type { FirmListItem } from "@/lib/types";
import { useSearchParams } from "next/navigation";

export default function FirmsPage() {
  const [firms, setFirms] = useState<FirmListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [strategyParent, setStrategyParent] = useState("");
  const [focusParent, setFocusParent] = useState("");
  const [stage, setStage] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [classificationStatus, setClassificationStatus] = useState("");
  const [domainResolutionStatus, setDomainResolutionStatus] = useState("");
  const [withinMandate, setWithinMandate] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [populateOpen, setPopulateOpen] = useState(false);
  const [openFirmId, setOpenFirmId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<FirmContextMenuTarget | null>(null);
  const [contextPopulateTarget, setContextPopulateTarget] = useState<{ id: string; name: string } | null>(null);
  const [addToProjectTarget, setAddToProjectTarget] = useState<{ id: string; name: string } | null>(null);
  const [addTaskTarget, setAddTaskTarget] = useState<{ id: string; name: string } | null>(null);
  const [addNoteTarget, setAddNoteTarget] = useState<{ id: string; name: string } | null>(null);

  const searchParams = useSearchParams();

  const hasFilters = !!(search || strategyParent || focusParent || stage || sourceType || classificationStatus || domainResolutionStatus || withinMandate);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    if (strategyParent) qs.set("strategyParent", strategyParent);
    if (focusParent) qs.set("focusParent", focusParent);
    if (stage) qs.set("stage", stage);
    if (sourceType) qs.set("sourceType", sourceType);
    if (classificationStatus) qs.set("classificationStatus", classificationStatus);
    if (domainResolutionStatus) qs.set("domainResolutionStatus", domainResolutionStatus);
    if (withinMandate) qs.set("withinMandate", withinMandate);
    const res = await fetch(`/api/firms?${qs.toString()}`);
    const data = await res.json();
    setFirms(data.firms ?? []);
    setLoading(false);
  }, [search, strategyParent, focusParent, stage, sourceType, classificationStatus, domainResolutionStatus, withinMandate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) setOpenFirmId(openId);
  }, [searchParams]);

  function clearFilters() {
    setSearch("");
    setStrategyParent("");
    setFocusParent("");
    setStage("");
    setSourceType("");
    setClassificationStatus("");
    setDomainResolutionStatus("");
    setWithinMandate("");
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function bulkAction(action: string, extra?: Record<string, unknown>) {
    await fetch("/api/firms/bulk", { method: "POST", body: JSON.stringify({ action, firmIds: Array.from(selected), ...extra }) });
    setSelected(new Set());
    load();
  }

  const { handleAction, modals } = useNextStepActions(load);

  const populateCriteria = useMemo(() => {
    const strategies = strategyParent ? { [strategyParent]: [] } : {};
    const focusAreas = focusParent ? { [focusParent]: [] } : {};
    return { strategies, focusAreas };
  }, [strategyParent, focusParent]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Firms Database</h1>
          <p className="text-sm text-text-secondary">{firms.length} firms</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Firm
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
          <Input placeholder="Search firms…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-48 pl-8" />
        </div>
        <Select value={strategyParent} onChange={(e) => setStrategyParent(e.target.value)} className="w-44">
          <option value="">All Strategies</option>
          {Object.keys(STRATEGIES_TAXONOMY).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={focusParent} onChange={(e) => setFocusParent(e.target.value)} className="w-44">
          <option value="">All Focus Areas</option>
          {Object.keys(FOCUS_AREAS_TAXONOMY).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={stage} onChange={(e) => setStage(e.target.value)} className="w-44">
          <option value="">All Stages</option>
          {CRM_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="w-36">
          <option value="">All Sources</option>
          <option value="seed">Seed</option>
          <option value="manual_add">Manual Add</option>
          <option value="comparable">Comparable</option>
        </Select>
        <Select value={classificationStatus} onChange={(e) => setClassificationStatus(e.target.value)} className="w-40">
          <option value="">All Classification</option>
          <option value="classified">Classified</option>
          <option value="needs_review">Needs Review</option>
          <option value="unclassified">Unclassified</option>
        </Select>
        <Select value={domainResolutionStatus} onChange={(e) => setDomainResolutionStatus(e.target.value)} className="w-40">
          <option value="">All Domains</option>
          <option value="resolved">Resolved</option>
          <option value="ambiguous">Ambiguous</option>
          <option value="unresolved">Unresolved</option>
        </Select>
        <Select value={withinMandate} onChange={(e) => setWithinMandate(e.target.value)} className="w-36">
          <option value="">Any Mandate</option>
          <option value="yes">Within</option>
          <option value="no">Outside</option>
          <option value="unconfirmed">Unconfirmed</option>
        </Select>

        {hasFilters && (
          <>
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear Filters
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPopulateOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" /> Populate using current filters
            </Button>
          </>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-status-blue-bg px-4 py-2.5 text-sm">
          <span className="font-medium text-text-primary">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => bulkAction("find_similar")}>
            Find Similar Firms
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkAction("delete")}>
            Bulk Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">
            Clear Selection
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8"></th>
              <th>Firm Name</th>
              <th>HQ</th>
              <th>Strategies</th>
              <th>Focus Areas</th>
              <th>AUM</th>
              <th>CRM Stage</th>
              <th>Next Step</th>
              <th className="w-8"></th>
              <th>Primary Contact</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-text-secondary">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && firms.length === 0 && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-text-secondary">
                  No firms yet. Click Add Firm to get started.
                </td>
              </tr>
            )}
            {firms.map((firm) => {
              const primaryContact = firm.contacts[0];
              return (
                <tr
                  key={firm.id}
                  onClick={() => setOpenFirmId(firm.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, firmId: firm.id, firmName: firm.name, domain: firm.domain });
                  }}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(firm.id)} onCheckedChange={() => toggleSelect(firm.id)} />
                  </td>
                  <td className="font-medium text-text-primary">{firm.name}</td>
                  <td className="text-text-secondary">{firm.hqLocation ?? "—"}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {Object.keys(firm.strategies ?? {}).slice(0, 3).map((s) => (
                        <TagPill key={s}>{s}</TagPill>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {Object.keys(firm.focusAreas ?? {}).slice(0, 3).map((s) => (
                        <TagPill key={s}>{s}</TagPill>
                      ))}
                    </div>
                  </td>
                  <td className="font-medium text-text-primary">{firm.aumDisplay ?? "NA"}</td>
                  <td>
                    {firm.crmStage && <Pill color={STAGE_COLORS[firm.crmStage.stage]}>{STAGE_LABELS[firm.crmStage.stage]}</Pill>}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <NextStepCell firm={firm} onAction={handleAction} />
                  </td>
                  <td>
                    {firm.unreadNotifications > 0 && (
                      <span className="flex items-center gap-1 text-status-red" title={`${firm.unreadNotifications} unread notification(s)`}>
                        <Bell className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">{firm.unreadNotifications}</span>
                      </span>
                    )}
                  </td>
                  <td className="text-text-secondary">{primaryContact?.name ?? "—"}</td>
                  <td>
                    {primaryContact?.email ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-text-secondary">{primaryContact.email}</span>
                        <Pill color={primaryContact.emailStatus === "verified" ? "green" : primaryContact.emailStatus === "inferred" ? "amber" : "gray"}>
                          {primaryContact.emailStatus}
                        </Pill>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AddFirmModal open={addOpen} onOpenChange={setAddOpen} onDone={load} />
      <PopulateModal
        open={populateOpen}
        onOpenChange={setPopulateOpen}
        onDone={load}
        initialMode="by_criteria"
        initialStrategies={populateCriteria.strategies}
        initialFocusAreas={populateCriteria.focusAreas}
      />
      <FirmDrawer firmId={openFirmId} onClose={() => setOpenFirmId(null)} onChanged={load} />
      {modals}

      {contextMenu && (
        <FirmContextMenu
          target={contextMenu}
          onClose={() => setContextMenu(null)}
          onEdit={() => {
            setOpenFirmId(contextMenu.firmId);
            setContextMenu(null);
          }}
          onAddToProject={() => {
            setAddToProjectTarget({ id: contextMenu.firmId, name: contextMenu.firmName });
            setContextMenu(null);
          }}
          onAssignOwner={async (userId) => {
            await fetch(`/api/firms/${contextMenu.firmId}`, { method: "PATCH", body: JSON.stringify({ ownerId: userId }) });
            setContextMenu(null);
            load();
          }}
          onAddTask={() => {
            setAddTaskTarget({ id: contextMenu.firmId, name: contextMenu.firmName });
            setContextMenu(null);
          }}
          onAddNote={() => {
            setAddNoteTarget({ id: contextMenu.firmId, name: contextMenu.firmName });
            setContextMenu(null);
          }}
          onFindSimilar={() => {
            setContextPopulateTarget({ id: contextMenu.firmId, name: contextMenu.firmName });
            setContextMenu(null);
          }}
          onDelete={async () => {
            if (confirm(`Delete ${contextMenu.firmName}? This soft-deletes the firm — it can be restored later from Settings.`)) {
              await fetch(`/api/firms/${contextMenu.firmId}`, { method: "DELETE" });
              load();
            }
            setContextMenu(null);
          }}
        />
      )}

      <AddToProjectModal
        open={!!addToProjectTarget}
        onOpenChange={(o) => !o && setAddToProjectTarget(null)}
        firmId={addToProjectTarget?.id ?? null}
        firmName={addToProjectTarget?.name}
        onAdded={load}
      />
      <QuickAddTaskModal
        open={!!addTaskTarget}
        onOpenChange={(o) => !o && setAddTaskTarget(null)}
        firmId={addTaskTarget?.id ?? null}
        firmName={addTaskTarget?.name}
        onAdded={load}
      />
      <AddNoteModal
        open={!!addNoteTarget}
        onOpenChange={(o) => !o && setAddNoteTarget(null)}
        firmId={addNoteTarget?.id ?? null}
        firmName={addNoteTarget?.name}
        onAdded={load}
      />
      {contextPopulateTarget && (
        <PopulateModal
          open={!!contextPopulateTarget}
          onOpenChange={(o) => !o && setContextPopulateTarget(null)}
          onDone={load}
          initialMode="similar_to_firm"
          seedFirmId={contextPopulateTarget.id}
          seedFirmName={contextPopulateTarget.name}
        />
      )}
    </div>
  );
}
