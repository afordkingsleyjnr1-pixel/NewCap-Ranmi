"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { TaxonomyPicker } from "../../../firms/_components/taxonomy-picker";
import { STRATEGIES_TAXONOMY, FOCUS_AREAS_TAXONOMY } from "@/lib/taxonomy";

const PAGE_SIZE = 50;

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
// result when both are set (AND across categories, OR within a category,
// so filtering by strategy alone, focus area alone, or both all work) —
// same semantics as the Firms Database grid filters.
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
  const [page, setPage] = useState(1);
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
      setPage(1);
      setError(null);
    }
  }, [open]);

  const notInProject = useMemo(() => firms.filter((f) => !existingFirmIds.includes(f.id)), [firms, existingFirmIds]);

  const hasTaxonomySelection = Object.keys(strategies).length > 0 || Object.keys(focusAreas).length > 0;
  const hasSearchTerm = search.trim().length > 0;

  // Nothing shows until the user actually searches or picks a taxonomy
  // filter — with a large firm database, listing everything by default
  // is exactly the "crowded, not user friendly" problem being fixed here.
  const matching =
    mode === "search"
      ? hasSearchTerm
        ? notInProject.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
        : []
      : hasTaxonomySelection
        ? notInProject.filter((f) => matchesTaxonomy(f.strategies, strategies) && matchesTaxonomy(f.focusAreas, focusAreas))
        : [];

  useEffect(() => setPage(1), [search, strategies, focusAreas, mode]);

  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const paged = matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const rangeStart = matching.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, matching.length);
  const allMatchingSelected = matching.length > 0 && matching.every((f) => selected.has(f.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllMatching() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allMatchingSelected) matching.forEach((f) => next.delete(f.id));
      else matching.forEach((f) => next.add(f.id));
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
    <Modal open={open} onOpenChange={onOpenChange} title="Add Firms to Project" widthClassName="max-w-3xl">
      <div className="space-y-4">
        <div className="flex gap-1 rounded-md border border-border bg-page p-1 text-sm font-medium">
          <button
            onClick={() => setMode("search")}
            className={`flex-1 rounded px-3 py-2 ${mode === "search" ? "bg-primary text-white" : "text-text-secondary hover:bg-white"}`}
          >
            By Search
          </button>
          <button
            onClick={() => setMode("taxonomy")}
            className={`flex-1 rounded px-3 py-2 ${mode === "taxonomy" ? "bg-primary text-white" : "text-text-secondary hover:bg-white"}`}
          >
            By Strategy and/or Focus Area
          </button>
        </div>

        {mode === "search" ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input placeholder="Search firms already in your database…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 pl-9" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 rounded-md border border-border p-3">
            <div className="max-h-56 overflow-y-auto pr-1">
              <p className="mb-1.5 text-xs font-medium text-text-secondary">Strategies</p>
              <TaxonomyPicker taxonomy={STRATEGIES_TAXONOMY} selection={strategies} onChange={setStrategies} />
            </div>
            <div className="max-h-56 overflow-y-auto pr-1">
              <p className="mb-1.5 text-xs font-medium text-text-secondary">Focus Areas</p>
              <TaxonomyPicker taxonomy={FOCUS_AREAS_TAXONOMY} selection={focusAreas} onChange={setFocusAreas} />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-text-secondary">
          <div className="flex items-center gap-3">
            <span>{selected.size} selected</span>
            {matching.length > 0 && (
              <button onClick={toggleAllMatching} className="text-accent hover:underline">
                {allMatchingSelected ? "Clear all matching" : `Select all ${matching.length} matching`}
              </button>
            )}
          </div>
          {matching.length > 0 && (
            <div className="flex items-center gap-2">
              <span>
                {rangeStart}–{rangeEnd} of {matching.length}
              </span>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded p-1 hover:bg-page disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page >= pageCount}
                className="rounded p-1 hover:bg-page disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto rounded-md border border-border">
          {matching.length === 0 && (
            <p className="p-4 text-sm text-text-secondary">
              {mode === "search"
                ? hasSearchTerm
                  ? "No matching firms."
                  : "Type a firm name to search your database."
                : hasTaxonomySelection
                  ? "No matching firms."
                  : "Pick a strategy and/or focus area above to see matching firms."}
            </p>
          )}
          {paged.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 text-sm last:border-0 hover:bg-page">
              <Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggle(f.id)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{f.name}</span>
                  {f.hqLocation && <span className="text-xs text-text-secondary">{f.hqLocation}</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Object.values(f.strategies).flat().slice(0, 4).map((s) => (
                    <Pill key={s} color="gray">
                      {s}
                    </Pill>
                  ))}
                  {Object.values(f.focusAreas).flat().slice(0, 4).map((s) => (
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
        <div className="flex items-center justify-between border-t border-border pt-4">
          <p className="text-xs text-text-secondary">{selected.size} selected</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={loading || selected.size === 0}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add {selected.size > 0 ? `${selected.size} ` : ""}Firm{selected.size === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
