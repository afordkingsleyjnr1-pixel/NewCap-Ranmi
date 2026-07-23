"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface Target {
  firmId: string;
  contactId?: string;
  firmName: string;
}

type Kind = "email" | "follow_up" | "term_sheet";

// Section: Messaging Within Projects — send to multiple firms/contacts at
// once. Reuses /api/projects/[id]/bulk-email, which runs each recipient
// through the exact same send-and-CRM-stage-advance pipeline as a single
// send (see lib/services/outreach.ts) — never a separate workflow.
export function BulkEmailModal({
  open,
  onOpenChange,
  projectId,
  targets,
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  targets: Target[];
  onSent: () => void;
}) {
  const [kind, setKind] = useState<Kind>("email");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sentCount: number; failedCount: number; results: Array<{ firmId: string; ok: boolean; error?: string }> } | null>(
    null
  );

  useEffect(() => {
    if (open) {
      setKind("email");
      setSubject("");
      setMessage("");
      setError(null);
      setResult(null);
    }
  }, [open]);

  const missingEmail = targets.filter((t) => !t.contactId);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/bulk-email`, {
        method: "POST",
        body: JSON.stringify({ targets: targets.filter((t) => t.contactId), subject, message, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setResult(data);
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`Send Bulk Email (${targets.length} firm${targets.length === 1 ? "" : "s"})`} widthClassName="max-w-lg">
      {result ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Pill color="green">{result.sentCount} sent</Pill>
            {result.failedCount > 0 && <Pill color="red">{result.failedCount} failed</Pill>}
          </div>
          {result.results
            .filter((r) => !r.ok)
            .map((r, i) => (
              <p key={i} className="text-xs text-status-red">
                {r.firmId}: {r.error}
              </p>
            ))}
          <div className="flex justify-end">
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {missingEmail.length > 0 && (
            <p className="rounded-md bg-status-amber-bg px-3 py-2 text-xs text-status-amber">
              {missingEmail.length} of {targets.length} selected firm(s) have no contact with a known email and will be skipped: {missingEmail.map((t) => t.firmName).join(", ")}
            </p>
          )}
          <div>
            <Label>Type</Label>
            <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              <option value="email">Email</option>
              <option value="follow_up">Follow-Up</option>
              <option value="term_sheet">Term Sheet / LOI</option>
            </Select>
          </div>
          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label>Message</Label>
            <Textarea rows={8} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          {error && <p className="text-xs text-status-red">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={loading || !subject.trim() || !message.trim() || targets.filter((t) => t.contactId).length === 0}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Send to {targets.filter((t) => t.contactId).length}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
