"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Section 4 — "Responded" stage: present the entity's reply outcome as two
// options. Interested creates the "Schedule Meeting" task; Not Interested
// moves the entity to Nurture.
export function ReviewReplyModal({
  open,
  onOpenChange,
  entityId,
  firmName,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entityId: string | null;
  firmName?: string;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState<"interested" | "not_interested" | null>(null);

  async function choose(outcome: "interested" | "not_interested") {
    if (!entityId) return;
    setLoading(outcome);
    await fetch(`/api/crm/${entityId}/respond`, { method: "POST", body: JSON.stringify({ outcome }) });
    setLoading(null);
    onDone();
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Review Reply" description={firmName} widthClassName="max-w-sm">
      <div className="space-y-3">
        <p className="text-sm text-text-secondary">This entity replied. What's the outcome?</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => choose("interested")} disabled={!!loading}>
            {loading === "interested" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Interested
          </Button>
          <Button className="flex-1" variant="outline" onClick={() => choose("not_interested")} disabled={!!loading}>
            {loading === "not_interested" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Not Interested
          </Button>
        </div>
      </div>
    </Modal>
  );
}
