"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

const TASK_KINDS = [
  { value: "send_email", label: "Send Email" },
  { value: "send_follow_up", label: "Send Follow-up" },
  { value: "schedule_meeting", label: "Schedule Meeting" },
  { value: "send_term_sheet", label: "Send Term Sheet / LOI" },
  { value: "custom", label: "Custom Task" },
] as const;

export function QuickAddTaskModal({
  open,
  onOpenChange,
  firmId,
  firmName,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  firmId: string | null;
  firmName?: string;
  onAdded: () => void;
}) {
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [kind, setKind] = useState<(typeof TASK_KINDS)[number]["value"]>("send_email");
  const [customTitle, setCustomTitle] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetch("/api/users")
        .then((r) => r.json())
        .then((d) => setUsers((d.users ?? []).filter((u: any) => u.status === "active")));
      setKind("send_email");
      setCustomTitle("");
      setOwnerId("");
      setDueDate("");
      setError(null);
    }
  }, [open]);

  const needsCustomTitle = kind === "custom";

  async function submit() {
    if (!firmId) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { firmId, dueDate: dueDate || undefined, ownerId: ownerId || undefined };
      if (needsCustomTitle) body.title = customTitle;
      else body.kind = kind;
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
    <Modal open={open} onOpenChange={onOpenChange} title="Add Task" description={firmName} widthClassName="max-w-sm">
      <div className="space-y-3">
        <div>
          <Label>Task Type</Label>
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
            <Label>Task Title</Label>
            <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Task title" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Assign To</Label>
            <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">— Me —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-xs text-status-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading || (needsCustomTitle && !customTitle.trim())}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add Task
          </Button>
        </div>
      </div>
    </Modal>
  );
}
