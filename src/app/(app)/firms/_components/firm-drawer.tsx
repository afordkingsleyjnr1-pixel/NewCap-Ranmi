"use client";

import { useEffect, useState, useCallback } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Pill, TagPill } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { STAGE_LABELS, STAGE_COLORS, CRM_STAGES, nextStepForFirm } from "@/lib/crm-stages";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import { Loader2, RefreshCw, UserSearch, Trash2, ExternalLink, Search, Pencil, Plus } from "lucide-react";
import { PopulateModal } from "./populate-modal";
import { EditContactModal, type EditableContact } from "./edit-contact-modal";
import { AddContactModal } from "./add-contact-modal";
import { AddToProjectModal } from "./add-to-project-modal";
import { useNextStepActions } from "../../crm/_components/use-next-step-actions";

interface Props {
  entityId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

export function FirmDrawer({ entityId, onClose, onChanged }: Props) {
  const [data, setData] = useState<any>(null);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [populateOpen, setPopulateOpen] = useState(false);
  const [findContactWarnings, setFindContactWarnings] = useState<string[]>([]);
  const [editingContact, setEditingContact] = useState<EditableContact | null>(null);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addToProjectOpen, setAddToProjectOpen] = useState(false);
  const [domainDraft, setDomainDraft] = useState("");
  const [savingDomain, setSavingDomain] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    const res = await fetch(`/api/entities/${entityId}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [entityId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setDomainDraft(data?.entity?.domain ?? "");
  }, [data?.entity?.domain]);

  useEffect(() => {
    if (entityId) {
      fetch("/api/users")
        .then((r) => r.json())
        .then((d) => setUsers((d.users ?? []).filter((u: any) => u.status === "active")));
    }
  }, [entityId]);

  const { handleAction, modals: nextStepModals } = useNextStepActions(() => {
    load();
    onChanged();
  });

  if (!entityId) return null;
  const entity = data?.entity;
  const openTasks = entity?.tasks?.filter((t: any) => t.status === "open") ?? [];
  const nextStep = entity?.stage ? nextStepForFirm(entity.stage.stage, openTasks, entity.meetings ?? []) : null;
  const scheduledMeetingId = entity?.meetings?.find((m: any) => m.status === "scheduled")?.id;

  async function reclassify() {
    setBusy("reclassify");
    await fetch(`/api/entities/${entityId}/reclassify`, { method: "POST" });
    await load();
    onChanged();
    setBusy(null);
  }

  async function findContact() {
    setBusy("findContact");
    setFindContactWarnings([]);
    const res = await fetch(`/api/entities/${entityId}/find-contact`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFindContactWarnings([data.error ?? "Find Contact failed."]);
    } else if (data.warnings?.length) {
      setFindContactWarnings(data.warnings);
    }
    await load();
    onChanged();
    setBusy(null);
  }

  async function changeStage(stage: string) {
    setBusy("stage");
    await fetch(`/api/crm/${entityId}/stage`, { method: "PATCH", body: JSON.stringify({ stage }) });
    await load();
    onChanged();
    setBusy(null);
  }

  async function changeOwner(ownerId: string) {
    setBusy("owner");
    await fetch(`/api/entities/${entityId}`, { method: "PATCH", body: JSON.stringify({ ownerId: ownerId || null }) });
    await load();
    onChanged();
    setBusy(null);
  }

  async function deleteFirm() {
    if (!confirm(`Delete ${entity.name}? This soft-deletes the entity — contacts (${entity.contacts.length}), activity log, and tasks are preserved and can be restored later.`)) return;
    setBusy("delete");
    await fetch(`/api/entities/${entityId}`, { method: "DELETE" });
    onChanged();
    onClose();
    setBusy(null);
  }

  async function saveDomain() {
    const cleaned = domainDraft.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (!cleaned) return;
    setSavingDomain(true);
    await fetch(`/api/entities/${entityId}`, {
      method: "PATCH",
      body: JSON.stringify({ domain: cleaned, domainResolutionStatus: "resolved" }),
    });
    await load();
    onChanged();
    setSavingDomain(false);
  }

  async function clearMandateOverride() {
    setBusy("mandate");
    await fetch(`/api/entities/${entityId}`, { method: "PATCH", body: JSON.stringify({ clearWithinMandateOverride: true }) });
    await load();
    onChanged();
    setBusy(null);
  }

  async function deleteContact(contactId: string, contactName: string) {
    if (!confirm(`Delete contact ${contactName}? This cannot be undone.`)) return;
    setBusy(`contact-${contactId}`);
    await fetch(`/api/contacts/${contactId}`, { method: "DELETE" });
    await load();
    onChanged();
    setBusy(null);
  }

  async function findEmailForContact(contactId: string) {
    setBusy(`email-${contactId}`);
    setFindContactWarnings([]);
    const res = await fetch(`/api/contacts/${contactId}/find-email`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFindContactWarnings([data.error ?? "Find Email failed."]);
    } else if (!data.contact?.email) {
      setFindContactWarnings(["Hunter.io found no email for this contact."]);
    }
    await load();
    onChanged();
    setBusy(null);
  }

  async function deleteTask(taskId: string, taskTitle: string) {
    if (!confirm(`Delete task "${taskTitle}"? This cannot be undone.`)) return;
    setBusy(`task-${taskId}`);
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    await load();
    onChanged();
    setBusy(null);
  }

  async function toggleTaskDone(taskId: string, currentStatus: string) {
    await fetch(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: currentStatus === "done" ? "open" : "done" }) });
    await load();
    onChanged();
  }

  return (
    <>
      <Drawer
        open={!!entityId}
        onOpenChange={(o) => !o && onClose()}
        title={loading || !entity ? "Loading…" : entity.name}
        subtitle={
          entity ? (
            <>
              {entity.hqLocation ?? "HQ unknown"} ·{" "}
              {entity.domain ? (
                <a
                  href={`https://${entity.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  {entity.domain}
                </a>
              ) : (
                "no domain resolved"
              )}
            </>
          ) : undefined
        }
        widthClassName="max-w-3xl"
      >
        {!entity ? (
          <div className="flex items-center justify-center py-20 text-text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {entity.stage && (
                <Pill color={STAGE_COLORS[entity.stage.stage as keyof typeof STAGE_COLORS]}>{STAGE_LABELS[entity.stage.stage as keyof typeof STAGE_LABELS]}</Pill>
              )}
              <TagPill>{entity.sourceType}</TagPill>
              {entity.domainResolutionStatus && entity.domainResolutionStatus !== "resolved" && (
                <Pill color="amber">Domain: {entity.domainResolutionStatus}</Pill>
              )}
              {entity.classificationStatus === "needs_review" && <Pill color="amber">Needs classification review</Pill>}
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setAddToProjectOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add to Project
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPopulateOpen(true)}>
                  Find Similar Entities
                </Button>
                <Button size="sm" variant="destructive" onClick={deleteFirm} disabled={busy === "delete"}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>

            {entity.domainResolutionStatus !== "resolved" && (
              <div className="space-y-2 rounded-md bg-status-amber-bg p-3">
                <p className="text-xs font-medium text-status-amber">
                  Domain research {entity.domainResolutionStatus === "ambiguous" ? "found multiple possible matches" : "couldn't confidently resolve"} for
                  this entity — Find Contact and Find Email need a confirmed domain to run. Enter it below if you know it.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={domainDraft}
                    onChange={(e) => setDomainDraft(e.target.value)}
                    placeholder="example.com"
                    className="max-w-xs"
                  />
                  <Button size="sm" onClick={saveDomain} disabled={savingDomain || !domainDraft.trim()}>
                    {savingDomain && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Confirm Domain
                  </Button>
                </div>
              </div>
            )}

            {nextStep && (
              <div className="flex items-center justify-between rounded-md bg-page px-3 py-2.5">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">Next Step</span>
                  <p className="text-sm font-medium text-text-primary">{nextStep.label}</p>
                </div>
                {nextStep.action && (
                  <Button size="sm" onClick={() => handleAction(entity.id, nextStep.action!, scheduledMeetingId, entity.name)}>
                    {nextStep.label}
                  </Button>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>CRM Stage</Label>
                <Select value={entity.stage?.stage} onChange={(e) => changeStage(e.target.value)} disabled={busy === "stage"}>
                  {CRM_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Owner</Label>
                <Select value={entity.stage?.ownerId ?? ""} onChange={(e) => changeOwner(e.target.value)} disabled={busy === "owner"}>
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>AUM</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{entity.aumDisplay ?? "NA"}</span>
                  <span className="text-xs text-text-secondary">
                    {entity.aumConfidence ? `(${entity.aumConfidence}${entity.aumAsOf ? `, as of ${formatDate(entity.aumAsOf)}` : ""})` : ""}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-md bg-page px-3 py-2 text-sm">
              <span className="text-text-secondary">Within Mandate:</span>
              <Pill color={entity.withinMandate === "yes" ? "green" : entity.withinMandate === "no" ? "red" : "gray"}>
                {entity.withinMandate}
              </Pill>
              {entity.withinMandateManual && (
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
                <TabsTrigger value="contacts">Contacts ({entity.contacts.length})</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="tasks">Tasks ({entity.tasks.length})</TabsTrigger>
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
                      {Object.entries(entity.strategies ?? {}).map(([parent, children]) => (
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
                      {Object.keys(entity.strategies ?? {}).length === 0 && (
                        <p className="py-2 text-xs text-text-secondary">No strategies classified yet.</p>
                      )}
                    </Accordion>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">Focus Areas</p>
                    <Accordion type="multiple">
                      {Object.entries(entity.focusAreas ?? {}).map(([parent, children]) => (
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
                      {Object.keys(entity.focusAreas ?? {}).length === 0 && (
                        <p className="py-2 text-xs text-text-secondary">No focus areas classified yet.</p>
                      )}
                    </Accordion>
                  </div>
                  <div>
                    <Label>Strategy Detail (research notes)</Label>
                    <Textarea rows={4} defaultValue={entity.strategyDetail ?? ""} placeholder="Property types, deal types, fund structure…" />
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
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={findContact} disabled={busy === "findContact"}>
                      <UserSearch className="h-3.5 w-3.5" /> {busy === "findContact" ? "Researching…" : "Find Contact"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAddContactOpen(true)}>
                      <Plus className="h-3.5 w-3.5" /> Add Contact
                    </Button>
                  </div>
                  {findContactWarnings.length > 0 && (
                    <div className="rounded-md bg-status-amber-bg p-2.5">
                      {findContactWarnings.map((w, i) => (
                        <p key={i} className="text-xs text-status-amber">
                          {w}
                        </p>
                      ))}
                    </div>
                  )}
                  {entity.contacts.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {c.name} {c.isPrimaryBdContact && <TagPill className="ml-1">Primary</TagPill>}
                        </p>
                        <p className="text-xs text-text-secondary">{c.title ?? "—"}</p>
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs text-text-secondary">{c.email ?? "no email found"}</p>
                          {!c.email && (
                            <button
                              onClick={() => findEmailForContact(c.id)}
                              disabled={busy === `email-${c.id}` || !entity.domain}
                              title={!entity.domain ? "Entity has no resolved domain" : "Find email via Hunter.io"}
                              className="flex items-center gap-1 text-xs text-accent hover:underline disabled:cursor-not-allowed disabled:text-text-secondary disabled:no-underline"
                            >
                              {busy === `email-${c.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                              Find Email
                            </button>
                          )}
                        </div>
                        {c.alternateEmails?.length > 0 && (
                          <p className="text-xs text-text-secondary">Also: {c.alternateEmails.join(", ")}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Pill color={c.emailStatus === "verified" ? "green" : c.emailStatus === "inferred" ? "amber" : "gray"}>
                          {c.emailStatus}
                        </Pill>
                        <button
                          onClick={() =>
                            setEditingContact({ id: c.id, name: c.name, title: c.title, email: c.email, alternateEmails: c.alternateEmails ?? [], linkedinUrl: c.linkedinUrl })
                          }
                          className="rounded p-1 text-text-secondary hover:bg-page hover:text-accent"
                          title="Edit contact"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteContact(c.id, c.name)}
                          disabled={busy === `contact-${c.id}`}
                          className="rounded p-1 text-text-secondary hover:bg-page hover:text-status-red"
                          title="Delete contact permanently"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {entity.contacts.length === 0 && <p className="text-xs text-text-secondary">No contacts yet.</p>}
                </div>
              </TabsContent>

              <TabsContent value="activity">
                <div className="space-y-2">
                  {entity.activityLog.map((a: any) => (
                    <div key={a.id} className="border-b border-border py-2 text-sm last:border-0">
                      <p className="text-text-primary">{a.body}</p>
                      <p className="text-xs text-text-secondary">
                        {a.type} · {formatDateTime(a.createdAt)} {a.createdBy ? `· ${a.createdBy.name}` : ""}
                      </p>
                    </div>
                  ))}
                  {entity.activityLog.length === 0 && <p className="text-xs text-text-secondary">No activity yet.</p>}
                </div>
              </TabsContent>

              <TabsContent value="tasks">
                <div className="space-y-2">
                  {entity.tasks.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={t.status === "done"}
                          onChange={() => toggleTaskDone(t.id, t.status)}
                          className="h-3.5 w-3.5 rounded border-border"
                        />
                        <span className={t.status === "done" ? "text-text-secondary line-through" : "text-text-primary"}>{t.title}</span>
                      </label>
                      <div className="flex items-center gap-2">
                        {t.priority && t.priority !== "medium" && (
                          <Pill color={t.priority === "high" ? "red" : "gray"}>{t.priority}</Pill>
                        )}
                        <span className="text-xs text-text-secondary">{t.dueDate ? formatDate(t.dueDate) : "no due date"}</span>
                        <button
                          onClick={() => deleteTask(t.id, t.title)}
                          disabled={busy === `task-${t.id}`}
                          className="rounded p-1 text-text-secondary hover:bg-page hover:text-status-red"
                          title="Delete task permanently"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {entity.tasks.length === 0 && <p className="text-xs text-text-secondary">No tasks yet.</p>}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </Drawer>
      {entity && (
        <PopulateModal
          open={populateOpen}
          onOpenChange={setPopulateOpen}
          onDone={onChanged}
          initialMode="similar_to_firm"
          seedEntityId={entity.id}
          seedFirmName={entity.name}
        />
      )}
      <EditContactModal
        open={!!editingContact}
        onOpenChange={(o) => !o && setEditingContact(null)}
        contact={editingContact}
        onSaved={() => {
          load();
          onChanged();
        }}
      />
      <AddContactModal
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        entityId={entityId}
        onAdded={() => {
          load();
          onChanged();
        }}
      />
      <AddToProjectModal
        open={addToProjectOpen}
        onOpenChange={setAddToProjectOpen}
        entityId={entityId}
        firmName={entity?.name}
        onAdded={onChanged}
      />
      {nextStepModals}
    </>
  );
}
