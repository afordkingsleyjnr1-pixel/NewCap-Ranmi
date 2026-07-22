"use client";

import { useEffect, useState, useCallback } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Pill, TagPill } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Label, Select, Textarea } from "@/components/ui/input";
import { STAGE_LABELS, STAGE_COLORS, CRM_STAGES, nextStepForFirm } from "@/lib/crm-stages";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import { Loader2, RefreshCw, UserSearch, Trash2, ExternalLink } from "lucide-react";
import { PopulateModal } from "./populate-modal";
import { useNextStepActions } from "../../crm/_components/use-next-step-actions";

interface Props {
  firmId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

export function FirmDrawer({ firmId, onClose, onChanged }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [populateOpen, setPopulateOpen] = useState(false);

  const load = useCallback(async () => {
    if (!firmId) return;
    setLoading(true);
    const res = await fetch(`/api/firms/${firmId}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [firmId]);

  useEffect(() => {
    load();
  }, [load]);

  const { handleAction, modals: nextStepModals } = useNextStepActions(() => {
    load();
    onChanged();
  });

  if (!firmId) return null;
  const firm = data?.firm;
  const openTasks = firm?.tasks?.filter((t: any) => t.status === "open") ?? [];
  const nextStep = firm?.crmStage ? nextStepForFirm(firm.crmStage.stage, openTasks, firm.meetings ?? []) : null;
  const scheduledMeetingId = firm?.meetings?.find((m: any) => m.status === "scheduled")?.id;

  async function reclassify() {
    setBusy("reclassify");
    await fetch(`/api/firms/${firmId}/reclassify`, { method: "POST" });
    await load();
    onChanged();
    setBusy(null);
  }

  async function findContact() {
    setBusy("findContact");
    await fetch(`/api/firms/${firmId}/find-contact`, { method: "POST" });
    await load();
    onChanged();
    setBusy(null);
  }

  async function changeStage(stage: string) {
    setBusy("stage");
    await fetch(`/api/crm/${firmId}/stage`, { method: "PATCH", body: JSON.stringify({ stage }) });
    await load();
    onChanged();
    setBusy(null);
  }

  async function deleteFirm() {
    if (!confirm(`Delete ${firm.name}? This soft-deletes the firm — contacts (${firm.contacts.length}), activity log, and tasks are preserved and can be restored later.`)) return;
    setBusy("delete");
    await fetch(`/api/firms/${firmId}`, { method: "DELETE" });
    onChanged();
    onClose();
    setBusy(null);
  }

  async function clearMandateOverride() {
    setBusy("mandate");
    await fetch(`/api/firms/${firmId}`, { method: "PATCH", body: JSON.stringify({ clearWithinMandateOverride: true }) });
    await load();
    onChanged();
    setBusy(null);
  }

  return (
    <>
      <Drawer
        open={!!firmId}
        onOpenChange={(o) => !o && onClose()}
        title={loading || !firm ? "Loading…" : firm.name}
        subtitle={firm ? `${firm.hqLocation ?? "HQ unknown"} · ${firm.domain ?? "no domain resolved"}` : undefined}
        widthClassName="max-w-3xl"
      >
        {!firm ? (
          <div className="flex items-center justify-center py-20 text-text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {firm.crmStage && (
                <Pill color={STAGE_COLORS[firm.crmStage.stage as keyof typeof STAGE_COLORS]}>{STAGE_LABELS[firm.crmStage.stage as keyof typeof STAGE_LABELS]}</Pill>
              )}
              <TagPill>{firm.sourceType}</TagPill>
              {firm.domainResolutionStatus && firm.domainResolutionStatus !== "resolved" && (
                <Pill color="amber">Domain: {firm.domainResolutionStatus}</Pill>
              )}
              {firm.classificationStatus === "needs_review" && <Pill color="amber">Needs classification review</Pill>}
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPopulateOpen(true)}>
                  Find Similar Firms
                </Button>
                <Button size="sm" variant="destructive" onClick={deleteFirm} disabled={busy === "delete"}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>

            {nextStep && (
              <div className="flex items-center justify-between rounded-md bg-page px-3 py-2.5">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">Next Step</span>
                  <p className="text-sm font-medium text-text-primary">{nextStep.label}</p>
                </div>
                {nextStep.action && (
                  <Button size="sm" onClick={() => handleAction(firm.id, nextStep.action!, scheduledMeetingId, firm.name)}>
                    {nextStep.label}
                  </Button>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>CRM Stage</Label>
                <Select value={firm.crmStage?.stage} onChange={(e) => changeStage(e.target.value)} disabled={busy === "stage"}>
                  {CRM_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>AUM</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{firm.aumDisplay ?? "NA"}</span>
                  <span className="text-xs text-text-secondary">
                    {firm.aumConfidence ? `(${firm.aumConfidence}${firm.aumAsOf ? `, as of ${formatDate(firm.aumAsOf)}` : ""})` : ""}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-md bg-page px-3 py-2 text-sm">
              <span className="text-text-secondary">Within Mandate:</span>
              <Pill color={firm.withinMandate === "yes" ? "green" : firm.withinMandate === "no" ? "red" : "gray"}>
                {firm.withinMandate}
              </Pill>
              {firm.withinMandateManual && (
                <>
                  <span className="text-xs text-text-secondary">(manually set)</span>
                  <button className="text-xs text-accent hover:underline" onClick={clearMandateOverride}>
                    Clear Override
                  </button>
                </>
              )}
            </div>

            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="contacts">Contacts ({firm.contacts.length})</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="tasks">Tasks ({firm.tasks.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-text-primary">Strategies & Focus Areas</h4>
                    <Button size="sm" variant="ghost" onClick={reclassify} disabled={busy === "reclassify"}>
                      <RefreshCw className={cn("h-3.5 w-3.5", busy === "reclassify" && "animate-spin")} /> Reclassify
                    </Button>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">Strategies</p>
                    <Accordion type="multiple">
                      {Object.entries(firm.strategies ?? {}).map(([parent, children]) => (
                        <AccordionItem key={parent} value={parent}>
                          <AccordionTrigger>{parent}</AccordionTrigger>
                          <AccordionContent>
                            <div className="flex flex-wrap gap-1.5">
                              {(children as string[]).map((c) => (
                                <TagPill key={c}>{c}</TagPill>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                      {Object.keys(firm.strategies ?? {}).length === 0 && (
                        <p className="py-2 text-xs text-text-secondary">No strategies classified yet.</p>
                      )}
                    </Accordion>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">Focus Areas</p>
                    <Accordion type="multiple">
                      {Object.entries(firm.focusAreas ?? {}).map(([parent, children]) => (
                        <AccordionItem key={parent} value={parent}>
                          <AccordionTrigger>{parent}</AccordionTrigger>
                          <AccordionContent>
                            <div className="flex flex-wrap gap-1.5">
                              {(children as string[]).map((c) => (
                                <TagPill key={c}>{c}</TagPill>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                      {Object.keys(firm.focusAreas ?? {}).length === 0 && (
                        <p className="py-2 text-xs text-text-secondary">No focus areas classified yet.</p>
                      )}
                    </Accordion>
                  </div>
                  <div>
                    <Label>Strategy Detail (research notes)</Label>
                    <Textarea rows={4} defaultValue={firm.strategyDetail ?? ""} placeholder="Property types, deal types, fund structure…" />
                  </div>
                  {data.similarFirms?.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">Similar To</p>
                      <div className="flex flex-wrap gap-1.5">
                        {data.similarFirms.map((f: any) => (
                          <TagPill key={f.id} className={f.deletedAt ? "opacity-50" : ""}>
                            {f.name}
                            {f.deletedAt ? " (deleted)" : ""}
                          </TagPill>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="contacts">
                <div className="space-y-3">
                  <Button size="sm" variant="outline" onClick={findContact} disabled={busy === "findContact"}>
                    <UserSearch className="h-3.5 w-3.5" /> {busy === "findContact" ? "Researching…" : "Find Contact"}
                  </Button>
                  {firm.contacts.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {c.name} {c.isPrimaryBdContact && <TagPill className="ml-1">Primary</TagPill>}
                        </p>
                        <p className="text-xs text-text-secondary">{c.title ?? "—"}</p>
                        <p className="text-xs text-text-secondary">{c.email ?? "no email found"}</p>
                      </div>
                      <Pill color={c.emailStatus === "verified" ? "green" : c.emailStatus === "inferred" ? "amber" : "gray"}>
                        {c.emailStatus}
                      </Pill>
                    </div>
                  ))}
                  {firm.contacts.length === 0 && <p className="text-xs text-text-secondary">No contacts yet.</p>}
                </div>
              </TabsContent>

              <TabsContent value="activity">
                <div className="space-y-2">
                  {firm.activityLog.map((a: any) => (
                    <div key={a.id} className="border-b border-border py-2 text-sm last:border-0">
                      <p className="text-text-primary">{a.body}</p>
                      <p className="text-xs text-text-secondary">
                        {a.type} · {formatDateTime(a.createdAt)} {a.createdBy ? `· ${a.createdBy.name}` : ""}
                      </p>
                    </div>
                  ))}
                  {firm.activityLog.length === 0 && <p className="text-xs text-text-secondary">No activity yet.</p>}
                </div>
              </TabsContent>

              <TabsContent value="tasks">
                <div className="space-y-2">
                  {firm.tasks.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                      <span className={t.status === "done" ? "text-text-secondary line-through" : "text-text-primary"}>{t.title}</span>
                      <span className="text-xs text-text-secondary">{t.dueDate ? formatDate(t.dueDate) : "no due date"}</span>
                    </div>
                  ))}
                  {firm.tasks.length === 0 && <p className="text-xs text-text-secondary">No tasks yet.</p>}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </Drawer>
      {firm && (
        <PopulateModal
          open={populateOpen}
          onOpenChange={setPopulateOpen}
          onDone={onChanged}
          initialMode="similar_to_firm"
          seedFirmId={firm.id}
          seedFirmName={firm.name}
        />
      )}
      {nextStepModals}
    </>
  );
}
