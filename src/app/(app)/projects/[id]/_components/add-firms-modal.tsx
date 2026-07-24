"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search } from "lucide-react";
import { TaxonomyPicker } from "../../../firms/_components/taxonomy-picker";
import { STRATEGIES_TAXONOMY, FOCUS_AREAS_TAXONOMY } from "@/lib/taxonomy";

interface FirmOption {
  id: string;
  name: string;
  hqLocation: string | null;
  strategies: Record<string, string[]>;
  focusAreas: Record<string, string[]>;
}

type Mode = "search" | "taxonomy";

// A firm matches a taxonomy selection if it has any of the selected
// children under a selected parent — or, if a parent is selected with no
// children checked yet, any presence under that parent at all. Strategy
// and Focus Area selections are independent filters that both narrow the
// result (AND across categories, OR within a category) — same semantics
// as the Firms Database grid filters.
function matchesTaxonomy(firmTaxonomy: Record<string, string[]>, selection: Record<string, string[]>): boolean {
  const parents = Object.keys(selection);
  if (parents.length === 0) return true;
  return parents.some((parent) => {
    const firmChildren = firmTaxonomy[parent];
    if (!firmChildren) return false;
    const selectedChildren = selection[parent];
    if (selectedChildren.length === 0) return true;
    return selectedChildren.some((c) => firmChildren.includes(c));
  });
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
  const [mode, setMode] = useState<Mode>("search");
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [search, setSearch] = useState("");
  const [strategies, setStrategies] = useState<Record<string, string[]>>({});
  const [focusAreas, setFocusAreas] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetch("/api/firms")
        .then((r) => r.json())
        .then((d) =>
          setFirms(
            (d.firms ?? []).map((f: any) => ({
              id: f.id,
              name: f.name,
              hqLocation: f.hqLocation,
              strategies: f.strategies ?? {},
              focusAreas: f.focusAreas ?? {},
            }))
          )
        );
      setMode("search");
      setSelected(new Set());
      setSearch("");
      setStrategies({});
      setFocusAreas({});
      setError(null);
    }
  }, [open]);

  const notInProject = firms.filter((f) => !existingFirmIds.includes(f.id));
  const available =
    mode === "search"
      ? notInProject.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
      : notInProject.filter((f) => matchesTaxonomy(f.strategies, strategies) && matchesTaxonomy(f.focusAreas, focusAreas));

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
        <div className="flex gap-1 rounded-md border border-border bg-page p-1 text-xs font-medium">
          <button
            onClick={() => setMode("search")}
            className={`flex-1 rounded px-2 py-1.5 ${mode === "search" ? "bg-primary text-white" : "text-text-secondary hover:bg-white"}`}
          >
            By Search
          </button>
          <button
            onClick={() => setMode("taxonomy")}
            className={`flex-1 rounded px-2 py-1.5 ${mode === "taxonomy" ? "bg-primary text-white" : "text-text-secondary hover:bg-white"}`}
          >
            By Strategy & Focus Area
          </button>
        </div>

        {mode === "search" ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
            <Input placeholder="Search firms already in your database…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
        ) : (
          <div className="max-h-48 space-y-3 overflow-y-auto rounded-md border border-border p-2">
            <div>
              <p className="mb-1 text-xs font-medium text-text-secondary">Strategies</p>
              <TaxonomyPicker taxonomy={STRATEGIES_TAXONOMY} selection={strategies} onChange={setStrategies} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-text-secondary">Focus Areas</p>
              <TaxonomyPicker taxonomy={FOCUS_AREAS_TAXONOMY} selection={focusAreas} onChange={setFocusAreas} />
            </div>
          </div>
        )}

        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          {available.length === 0 && <p className="p-3 text-xs text-text-secondary">No matching firms.</p>}
          {available.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-start gap-2.5 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-page">
              <Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggle(f.id)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-text-primary">{f.name}</span>
                  {f.hqLocation && <span className="text-xs text-text-secondary">{f.hqLocation}</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.values(f.strategies).flat().slice(0, 3).map((s) => (
                    <Pill key={s} color="gray">
                      {s}
                    </Pill>
                  ))}
                  {Object.values(f.focusAreas).flat().slice(0, 3).map((s) => (
                    <Pill key={s} color="gray">
                      {s}
                    </Pill>
                  ))}
                </div>
              </div>
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
