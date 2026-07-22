"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

// Section 7 — Term Sheet / LOI Sent: final outcome, Closed Won or Closed
// Lost, with an optional deal-notes prompt (skippable).
export function CloseDealModal({
  open,
  onOpenChange,
  firmId,
  firmName,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  firmId: string | null;
  firmName?: string;
  onDone: () => void;
}) {
  const [outcome, setOutcome] = useState<"closed_won" | "closed_lost" | null>(null);
  const [dealNotes, setDealNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!firmId || !outcome) return;
    setLoading(true);
    await fetch(`/api/crm/${firmId}/stage`, { method: "PATCH", body: JSON.stringify({ stage: outcome, dealNotes: dealNotes || undefined }) });
    setLoading(false);
    setOutcome(null);
    setDealNotes("");
    onDone();
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Close Deal" description={firmName} widthClassName="max-w-sm">
      {!outcome ? (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setOutcome("closed_won")}>
            Closed Won
          </Button>
          <Button className="flex-1" variant="outline" onClick={() => setOutcome("closed_lost")}>
            Closed Lost
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label>Deal Notes (optional)</Label>
            <Textarea rows={3} value={dealNotes} onChange={(e) => setDealNotes(e.target.value)} placeholder="Fund size, terms, timing…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOutcome(null)}>
              Back
            </Button>
            <Button onClick={submit} disabled={loading}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm {outcome === "closed_won" ? "Closed Won" : "Closed Lost"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
