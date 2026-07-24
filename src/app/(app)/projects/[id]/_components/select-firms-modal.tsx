"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

const PAGE_SIZE = 50;

interface FirmOption {
  id: string;
  name: string;
}

// Firm picker for the Actions tab — kept as its own modal (search + select
// all + pages of 50) rather than an always-rendered inline list, so a
// project with hundreds or thousands of firms doesn't turn the Actions tab
// into a giant scrolling checklist by default.
export function SelectFirmsModal({
  open,
  onOpenChange,
  firms,
  initialSelected,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  firms: FirmOption[];
  initialSelected: Set<string>;
  onConfirm: (selected: Set<string>) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [staged, setStaged] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setStaged(new Set(initialSelected));
      setSearch("");
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(
    () => firms.filter((f) => f.name.toLowerCase().includes(search.toLowerCase())),
    [firms, search]
  );
  useEffect(() => setPage(1), [search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, filtered.length);
  const allFilteredSelected = filtered.length > 0 && filtered.every((f) => staged.has(f.id));

  function toggle(id: string) {
    setStaged((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setStaged((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((f) => next.delete(f.id));
      else filtered.forEach((f) => next.add(f.id));
      return next;
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Select Firms" widthClassName="max-w-2xl">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <Input placeholder="Search firms in this project…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 pl-9" />
        </div>

        <div className="flex items-center justify-between text-xs text-text-secondary">
          <div className="flex items-center gap-3">
            <span>{staged.size} selected</span>
            <button onClick={toggleAllFiltered} className="text-accent hover:underline" disabled={filtered.length === 0}>
              {allFilteredSelected ? "Clear all matching" : `Select all ${filtered.length} matching`}
            </button>
          </div>
          {filtered.length > 0 && (
            <div className="flex items-center gap-2">
              <span>
                {rangeStart}–{rangeEnd} of {filtered.length}
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

        <div className="max-h-[28rem] overflow-y-auto rounded-md border border-border">
          {paged.length === 0 && <p className="p-4 text-sm text-text-secondary">No matching firms.</p>}
          {paged.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0 hover:bg-page">
              <Checkbox checked={staged.has(f.id)} onCheckedChange={() => toggle(f.id)} />
              <span className="text-text-primary">{f.name}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <p className="text-xs text-text-secondary">{staged.size} firm(s) selected in total</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onConfirm(staged);
                onOpenChange(false);
              }}
            >
              Use Selection
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
