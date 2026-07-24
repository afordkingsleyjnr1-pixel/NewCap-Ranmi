"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/input";
import { Mail } from "lucide-react";
import { BulkEmailModal } from "./bulk-email-modal";

type EmailKind = "email" | "follow_up" | "term_sheet";

interface FirmForActions {
  id: string;
  name: string;
  contacts: Array<{ id: string; name: string; email: string | null }>;
}

interface TaskForActions {
  id: string;
  title: string;
  status: "open" | "done";
  batchId: string | null;
  firm: { id: string; name: string };
}

const EMAIL_KIND_LABEL: Record<EmailKind, string> = {
  email: "Send Email",
  follow_up: "Send Follow-Up",
  term_sheet: "Send Term Sheet / LOI",
};

function inferKind(title: string): EmailKind | null {
  if (title.startsWith("Send Email —")) return "email";
  if (title.startsWith("Send Follow-Up —")) return "follow_up";
  if (title.startsWith("Send Term Sheet / LOI —")) return "term_sheet";
  return null;
}

// Section: Actions Within Projects — CRM outreach triggered directly from
// the project, individually or in bulk, available to any user with
// send_outreach (Admins and Editors alike). Two ways in: execute a batch of
// same-action tasks at once (the "create a task for 50 firms, click Send
// Email" flow), or pick specific firms/contacts ad hoc without a task at
// all. Both funnel into the same /api/projects/[id]/bulk-email pipeline a
// single send already uses — CRM stage advance, activity log, and Messages
// record happen exactly as they would one at a time (see bulk-email route).
export function ActionsTab({
  projectId,
  firms,
  tasks,
  onDone,
}: {
  projectId: string;
  firms: FirmForActions[];
  tasks: TaskForActions[];
  onDone: () => void;
}) {
  const [selectedFirmIds, setSelectedFirmIds] = useState<Set<string>>(new Set());
  const [contactOverrides, setContactOverrides] = useState<Record<string, string>>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkKind, setBulkKind] = useState<EmailKind>("email");
  const [bulkTargets, setBulkTargets] = useState<Array<{ firmId: string; contactId?: string; firmName: string }>>([]);

  const batches = useMemo(() => {
    const groups = new Map<string, { kind: EmailKind; label: string; taskIds: string[]; firmIds: Set<string> }>();
    for (const t of tasks) {
      if (t.status !== "open" || !t.batchId) continue;
      const kind = inferKind(t.title);
      if (!kind) continue;
      const key = t.batchId;
      if (!groups.has(key)) groups.set(key, { kind, label: EMAIL_KIND_LABEL[kind], taskIds: [], firmIds: new Set() });
      const g = groups.get(key)!;
      g.taskIds.push(t.id);
      g.firmIds.add(t.firm.id);
    }
    return Array.from(groups.entries()).map(([batchId, g]) => ({ batchId, ...g }));
  }, [tasks]);

  function targetsFor(firmIds: Set<string> | string[]): Array<{ firmId: string; contactId?: string; firmName: string }> {
    const ids = Array.from(firmIds);
    return ids
      .map((firmId) => firms.find((f) => f.id === firmId))
      .filter((f): f is FirmForActions => !!f)
      .map((f) => ({
        firmId: f.id,
        contactId: contactOverrides[f.id] ?? f.contacts.find((c) => c.email)?.id,
        firmName: f.name,
      }));
  }

  function runBatch(batch: (typeof batches)[number]) {
    setBulkKind(batch.kind);
    setBulkTargets(targetsFor(batch.firmIds));
    setBulkOpen(true);
  }

  function runAdHoc() {
    setBulkKind("email");
    setBulkTargets(targetsFor(selectedFirmIds));
    setBulkOpen(true);
  }

  function toggleFirm(id: string) {
    setSelectedFirmIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">From Tasks</h3>
        <p className="mb-3 text-xs text-text-secondary">
          Tasks added for multiple firms at once (Add Task → Related Firms) show up here as one action you can execute for the whole batch.
        </p>
        {batches.length === 0 ? (
          <p className="text-xs text-text-secondary">No multi-firm email/follow-up/term-sheet tasks open right now.</p>
        ) : (
          <div className="space-y-2">
            {batches.map((b) => (
              <div key={b.batchId} className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-text-primary">{b.label}</p>
                  <p className="text-xs text-text-secondary">{b.firmIds.size} firm(s)</p>
                </div>
                <Button size="sm" onClick={() => runBatch(b)}>
                  <Mail className="h-3.5 w-3.5" /> {b.label}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Send Email — Ad Hoc</h3>
        <p className="mb-3 text-xs text-text-secondary">
          Pick any firm(s) in this project and, if a firm has more than one contact, choose which one to send to — no task required.
        </p>
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-2">
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
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={runAdHoc} disabled={selectedFirmIds.size === 0}>
            <Mail className="h-3.5 w-3.5" /> Send Email ({selectedFirmIds.size})
          </Button>
        </div>
      </div>

      <BulkEmailModal
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        projectId={projectId}
        targets={bulkTargets}
        initialKind={bulkKind}
        onSent={() => {
          setSelectedFirmIds(new Set());
          onDone();
        }}
      />
    </div>
  );
}
