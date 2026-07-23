"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search } from "lucide-react";

interface FirmOption {
  id: string;
  name: string;
  hqLocation: string | null;
}

export function AddFirmsModal({
  open,
  onOpenChange,
  projectId,
  existingFirmIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  existingFirmIds: string[];
  onAdded: () => void;
}) {
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetch("/api/firms")
        .then((r) => r.json())
        .then((d) => setFirms((d.firms ?? []).map((f: any) => ({ id: f.id, name: f.name, hqLocation: f.hqLocation }))));
      setSelected(new Set());
      setSearch("");
      setError(null);
    }
  }, [open]);

  const available = firms.filter((f) => !existingFirmIds.includes(f.id) && f.name.toLowerCase().includes(search.toLowerCase()));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/firms`, { method: "POST", body: JSON.stringify({ firmIds: Array.from(selected) }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add firms");
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
    <Modal open={open} onOpenChange={onOpenChange} title="Add Firms to Project" widthClassName="max-w-lg">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
          <Input placeholder="Search firms…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          {available.length === 0 && <p className="p-3 text-xs text-text-secondary">No matching firms.</p>}
          {available.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-page">
              <Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggle(f.id)} />
              <span className="text-text-primary">{f.name}</span>
              {f.hqLocation && <span className="text-xs text-text-secondary">{f.hqLocation}</span>}
            </label>
          ))}
        </div>
        {error && <p className="text-xs text-status-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading || selected.size === 0}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add {selected.size > 0 ? `${selected.size} ` : ""}Firm{selected.size === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
