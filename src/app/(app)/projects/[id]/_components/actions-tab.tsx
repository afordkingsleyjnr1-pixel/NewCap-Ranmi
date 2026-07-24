"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/drawer";
import { Mail, RefreshCw, FileText, CalendarClock, StickyNote, ArrowRightCircle, UserCog, Loader2 } from "lucide-react";
import { BulkEmailModal } from "./bulk-email-modal";
import { CRM_STAGES, STAGE_LABELS, type CrmStageKey } from "@/lib/crm-stages";
import type { StageAction } from "@/lib/crm-stages";

type EmailKind = "email" | "follow_up" | "term_sheet";

interface FirmForActions {
  id: string;
  name: string;
  contacts: Array<{ id: string; name: string; email: string | null }>;
}

interface MemberOption {
  id: string;
  name: string;
}

// Section: Actions Within Projects — every CRM action a user can take,
// individually or in bulk, run directly against firms selected right here.
// Open to any user with send_outreach/edit_firms (not admin-only) — the
// action bar pattern (select records, then pick what to do to all of them)
// mirrors how HubSpot/Salesforce list views handle bulk actions.
export function ActionsTab({
  projectId,
  firms,
  members,
  handleAction,
  onDone,
}: {
  projectId: string;
  firms: FirmForActions[];
  members: MemberOption[];
  /** From the shared useNextStepActions() instance — reused here so Schedule Meeting opens the exact same modal as everywhere else in the app. */
  handleAction: (firmId: string, action: NonNullable<StageAction>, meetingId?: string, firmName?: string) => void;
  onDone: () => void;
}) {
  const [selectedFirmIds, setSelectedFirmIds] = useState<Set<string>>(new Set());
  const [contactOverrides, setContactOverrides] = useState<Record<string, string>>({});

  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [bulkEmailKind, setBulkEmailKind] = useState<EmailKind>("email");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [stageValue, setStageValue] = useState<CrmStageKey>("email_sent");
  const [stageSaving, setStageSaving] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [ownerValue, setOwnerValue] = useState("");
  const [ownerSaving, setOwnerSaving] = useState(false);

  const selectedFirms = firms.filter((f) => selectedFirmIds.has(f.id));
  const targets = selectedFirms.map((f) => ({
    firmId: f.id,
    contactId: contactOverrides[f.id] ?? f.contacts.find((c) => c.email)?.id,
    firmName: f.name,
  }));

  function toggleFirm(id: string) {
    setSelectedFirmIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openEmail(kind: EmailKind) {
    setBulkEmailKind(kind);
    setBulkEmailOpen(true);
  }

  function openScheduleMeeting() {
    const only = selectedFirms[0];
    if (!only) return;
    handleAction(only.id, "schedule_meeting", undefined, only.name);
  }

  async function submitNote() {
    if (!noteText.trim()) return;
    setNoteSaving(true);
    try {
      await Promise.all(
        selectedFirms.map((f) => fetch(`/api/firms/${f.id}/notes`, { method: "POST", body: JSON.stringify({ body: noteText }) }))
      );
      setNoteOpen(false);
      setNoteText("");
      setSelectedFirmIds(new Set());
      onDone();
    } finally {
      setNoteSaving(false);
    }
  }

  async function submitStage() {
    setStageSaving(true);
    try {
      await Promise.all(
        selectedFirms.map((f) => fetch(`/api/crm/${f.id}/stage`, { method: "PATCH", body: JSON.stringify({ stage: stageValue }) }))
      );
      setStageOpen(false);
      setSelectedFirmIds(new Set());
      onDone();
    } finally {
      setStageSaving(false);
    }
  }

  async function submitOwner() {
    setOwnerSaving(true);
    try {
      await Promise.all(
        selectedFirms.map((f) => fetch(`/api/firms/${f.id}`, { method: "PATCH", body: JSON.stringify({ ownerId: ownerValue || null }) }))
      );
      setOwnerOpen(false);
      setSelectedFirmIds(new Set());
      onDone();
    } finally {
      setOwnerSaving(false);
    }
  }

  const hasSelection = selectedFirmIds.size > 0;
  const singleSelection = selectedFirmIds.size === 1;

  const ACTIONS: Array<{ key: string; label: string; icon: typeof Mail; enabled: boolean; disabledReason?: string; onClick: () => void }> = [
    { key: "email", label: "Send Email", icon: Mail, enabled: hasSelection, onClick: () => openEmail("email") },
    { key: "follow_up", label: "Send Follow-Up", icon: RefreshCw, enabled: hasSelection, onClick: () => openEmail("follow_up") },
    { key: "term_sheet", label: "Send Term Sheet / LOI", icon: FileText, enabled: hasSelection, onClick: () => openEmail("term_sheet") },
    {
      key: "meeting",
      label: "Schedule Meeting",
      icon: CalendarClock,
      enabled: singleSelection,
      disabledReason: "Select exactly one firm to schedule a meeting",
      onClick: openScheduleMeeting,
    },
    { key: "note", label: "Add Note", icon: StickyNote, enabled: hasSelection, onClick: () => setNoteOpen(true) },
    { key: "stage", label: "Change CRM Stage", icon: ArrowRightCircle, enabled: hasSelection, onClick: () => setStageOpen(true) },
    { key: "owner", label: "Assign Owner", icon: UserCog, enabled: hasSelection, onClick: () => setOwnerOpen(true) },
  ];

  return (
    <div className="space-y-4 pt-4">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-text-primary">1. Select firms</h3>
        <p className="mb-2 text-xs text-text-secondary">
          Pick who the action applies to. When a firm has more than one contact, choose which one to use.
        </p>
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
          {firms.length === 0 && <p className="p-2 text-xs text-text-secondary">No firms in this project yet.</p>}
          {firms.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-page">
              <label className="flex flex-1 items-center gap-2 text-sm text-text-primary">
                <Checkbox checked={selectedFirmIds.has(f.id)} onCheckedChange={() => toggleFirm(f.id)} />
                {f.name}
                {!f.contacts.some((c) => c.email) && <Pill color="amber">no email on file</Pill>}
              </label>
              {selectedFirmIds.has(f.id) && f.contacts.length > 1 && (
                <Select
                  className="w-48"
                  value={contactOverrides[f.id] ?? f.contacts.find((c) => c.email)?.id ?? ""}
                  onChange={(e) => setContactOverrides((prev) => ({ ...prev, [f.id]: e.target.value }))}
                >
                  {f.contacts.map((c) => (
                    <option key={c.id} value={c.id} disabled={!c.email}>
                      {c.name} {c.email ? "" : "(no email)"}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-text-primary">2. Choose an action</h3>
        <p className="mb-2 text-xs text-text-secondary">
          {hasSelection ? `Applies to ${selectedFirmIds.size} firm${selectedFirmIds.size === 1 ? "" : "s"}.` : "Select at least one firm above first."}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.key}
                onClick={a.onClick}
                disabled={!a.enabled}
                title={!a.enabled ? a.disabledReason ?? "Select at least one firm first" : undefined}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-4 text-center text-xs font-medium text-text-primary hover:border-accent hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-surface"
              >
                <Icon className="h-5 w-5 text-accent" />
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      <BulkEmailModal
        open={bulkEmailOpen}
        onOpenChange={setBulkEmailOpen}
        projectId={projectId}
        targets={targets}
        initialKind={bulkEmailKind}
        onSent={() => {
          setSelectedFirmIds(new Set());
          onDone();
        }}
      />

      <Modal open={noteOpen} onOpenChange={setNoteOpen} title="Add Note" widthClassName="max-w-sm">
        <div className="space-y-3">
          <p className="text-xs text-text-secondary">Logs the same note to {selectedFirms.length} firm(s)' Activity tab.</p>
          <div>
            <Label>Note</Label>
            <Textarea rows={4} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="What's the update?" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitNote} disabled={noteSaving || !noteText.trim()}>
              {noteSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add Note
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={stageOpen} onOpenChange={setStageOpen} title="Change CRM Stage" widthClassName="max-w-sm">
        <div className="space-y-3">
          <p className="text-xs text-text-secondary">Moves {selectedFirms.length} firm(s) to the selected stage.</p>
          <div>
            <Label>New Stage</Label>
            <Select value={stageValue} onChange={(e) => setStageValue(e.target.value as CrmStageKey)}>
              {CRM_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStageOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitStage} disabled={stageSaving}>
              {stageSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Change Stage
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={ownerOpen} onOpenChange={setOwnerOpen} title="Assign Owner" widthClassName="max-w-sm">
        <div className="space-y-3">
          <p className="text-xs text-text-secondary">Sets the owner for {selectedFirms.length} firm(s).</p>
          <div>
            <Label>Owner</Label>
            <Select value={ownerValue} onChange={(e) => setOwnerValue(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOwnerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitOwner} disabled={ownerSaving}>
              {ownerSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Assign Owner
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
