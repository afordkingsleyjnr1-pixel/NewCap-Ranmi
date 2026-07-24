"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

interface FirmOption {
  id: string;
  name: string;
  contacts: Array<{ id: string; name: string }>;
}

interface MemberOption {
  id: string;
  name: string;
}

// Kinds pulled straight from the existing CRM task set (Section: Project
// Tasks) — "Send Email" etc. create the same system pending-action task the
// Next Step engine creates automatically, so completing it still drives the
// firm's CRM stage. "Custom" is a plain ad hoc task; notes live in their own
// field below regardless of type, not as a task type of their own.
const TASK_KINDS = [
  { value: "send_email", label: "Send Email" },
  { value: "send_follow_up", label: "Send Follow-up" },
  { value: "schedule_meeting", label: "Schedule Meeting" },
  { value: "send_term_sheet", label: "Send Term Sheet / LOI" },
  { value: "custom", label: "Custom Task" },
] as const;

export function AddTaskModal({
  open,
  onOpenChange,
  projectId,
  firms,
  members,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  firms: FirmOption[];
  members: MemberOption[];
  onAdded: () => void;
}) {
  const [firmIds, setFirmIds] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<(typeof TASK_KINDS)[number]["value"]>("send_email");
  const [customTitle, setCustomTitle] = useState("");
  const [contactId, setContactId] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [notes, setNotes] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFirmIds(new Set(firms[0] ? [firms[0].id] : []));
      setKind("send_email");
      setCustomTitle("");
      setContactId("");
      setPriority("medium");
      setNotes("");
      setOwnerId("");
      setDueDate("");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const needsCustomTitle = kind === "custom";
  const singleFirm = firmIds.size === 1 ? firms.find((f) => firmIds.has(f.id)) : null;
  const allSelected = firms.length > 0 && firmIds.size === firms.length;

  function toggleFirm(id: string) {
    setFirmIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setContactId("");
  }

  function toggleAll() {
    setFirmIds(allSelected ? new Set() : new Set(firms.map((f) => f.id)));
    setContactId("");
  }

  async function submit() {
    if (firmIds.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        firmIds: Array.from(firmIds),
        contactId: contactId || undefined,
        projectId,
        priority,
        description: notes || undefined,
        dueDate: dueDate || undefined,
        ownerId: ownerId || undefined,
      };
      if (needsCustomTitle) {
        body.title = customTitle;
      } else {
        body.kind = kind;
      }
      const res = await fetch("/api/tasks", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add task");
      }
      onAdded();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add Task" widthClassName="max-w-md">
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label>Related Firms</Label>
            <button onClick={toggleAll} className="text-xs text-accent hover:underline">
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {firms.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm text-text-primary">
                <Checkbox checked={firmIds.has(f.id)} onCheckedChange={() => toggleFirm(f.id)} />
                {f.name}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label>Task Type / Action</Label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {TASK_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </div>
        {needsCustomTitle && (
          <div>
            <Label>Task Name</Label>
            <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Task title" />
          </div>
        )}

        {singleFirm && singleFirm.contacts.length > 0 && (
          <div>
            <Label>Related Contact</Label>
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">— None —</option>
              {singleFirm.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Assign To</Label>
            <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">— Me —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </div>
        </div>
        <div>
          <Label>Due Date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional context, instructions, or updates…" />
        </div>
        {error && <p className="text-xs text-status-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading || firmIds.size === 0 || (needsCustomTitle && !customTitle.trim())}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add Task{firmIds.size > 1 ? ` (${firmIds.size} firms)` : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
