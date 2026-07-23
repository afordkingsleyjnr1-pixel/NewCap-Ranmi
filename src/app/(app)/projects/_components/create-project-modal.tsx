"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface UserOption {
  id: string;
  name: string;
  email: string;
}

export function CreateProjectModal({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetch("/api/users")
        .then((r) => r.json())
        .then((d) => setUsers(d.users ?? []));
    } else {
      setName("");
      setDescription("");
      setType("");
      setStartDate(new Date().toISOString().slice(0, 10));
      setDueDate("");
      setOwnerId("");
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (!name.trim() || !startDate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name, description: description || undefined, type: type || undefined, startDate, dueDate: dueDate || undefined, ownerId: ownerId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create project");
      onCreated();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Create Project" widthClassName="max-w-lg">
      <div className="space-y-3">
        <div>
          <Label>Project Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 Capital Raise — Southeast Multifamily" />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <Label>Project Type (optional)</Label>
          <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="Capital Raise, Outreach Campaign, Transaction…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start Date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>Due Date (optional)</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Project Owner</Label>
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">— Me —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-xs text-status-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading || !name.trim() || !startDate}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create Project
          </Button>
        </div>
      </div>
    </Modal>
  );
}
