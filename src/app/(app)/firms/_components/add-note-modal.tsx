"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export function AddNoteModal({
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
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (!firmId || !note.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/firms/${firmId}/notes`, { method: "POST", body: JSON.stringify({ body: note }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add note");
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
    <Modal open={open} onOpenChange={onOpenChange} title="Add Note" description={firmName} widthClassName="max-w-sm">
      <div className="space-y-3">
        <div>
          <Label>Note</Label>
          <Textarea rows={5} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's the note?" />
        </div>
        {error && <p className="text-xs text-status-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading || !note.trim()}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add Note
          </Button>
        </div>
      </div>
    </Modal>
  );
}
