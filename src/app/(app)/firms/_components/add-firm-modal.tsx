"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface AddFirmSummary {
  summary: { addedCount: number; needsDomainConfirmationCount: number; skippedDuplicateCount: number };
  added: { id: string; name: string }[];
  needsDomainConfirmation: { id: string; name: string }[];
  skippedDuplicates: string[];
}

export function AddFirmModal({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [names, setNames] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AddFirmSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/firms", { method: "POST", body: JSON.stringify({ names }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add firms");
      setResult(data);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setNames("");
    setResult(null);
    setError(null);
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={close} title="Add Firm" description="Type one or more firm names — the platform researches everything else." widthClassName="max-w-xl">
      {!result ? (
        <div className="space-y-4">
          <Textarea
            rows={6}
            placeholder={"Toorak Capital Partners\nBridge Investment Group\n..."}
            value={names}
            onChange={(e) => setNames(e.target.value)}
          />
          <p className="text-xs text-text-secondary">
            One name per line, or comma-separated for a batch. The platform resolves the domain, researches AUM, runs the
            Classification Engine, and finds contacts + emails automatically.
          </p>
          {error && <p className="text-xs text-status-red">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={loading || names.trim().length === 0}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {loading ? "Researching…" : "Add & Research"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Pill color="green">{result.summary.addedCount} added and fully researched</Pill>
            <Pill color="amber">{result.summary.needsDomainConfirmationCount} need domain confirmation</Pill>
            <Pill color="gray">{result.summary.skippedDuplicateCount} skipped as existing duplicates</Pill>
          </div>
          {result.needsDomainConfirmation.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-text-secondary">Needs domain confirmation:</p>
              <ul className="text-xs text-text-primary">
                {result.needsDomainConfirmation.map((f) => (
                  <li key={f.id}>{f.name}</li>
                ))}
              </ul>
            </div>
          )}
          {result.skippedDuplicates.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-text-secondary">Skipped duplicates:</p>
              <ul className="text-xs text-text-primary">
                {result.skippedDuplicates.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
