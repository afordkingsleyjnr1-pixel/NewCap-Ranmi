"use client";

import { useState } from "react";
import { ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Section 5.10 — the exact same parent→child accordion component used for
// grid filters (5.1) and the Populate "By Strategy & Focus Area" picker.
export function TaxonomyPicker({
  taxonomy,
  selection,
  onChange,
}: {
  taxonomy: Record<string, string[]>;
  selection: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(parent: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(parent) ? next.delete(parent) : next.add(parent);
      return next;
    });
  }

  function toggleParent(parent: string) {
    const next = { ...selection };
    if (next[parent]) delete next[parent];
    else next[parent] = [];
    onChange(next);
  }

  function toggleChild(parent: string, child: string) {
    const current = selection[parent] ?? [];
    const nextChildren = current.includes(child) ? current.filter((c) => c !== child) : [...current, child];
    const next = { ...selection };
    if (nextChildren.length === 0 && !(parent in selection)) delete next[parent];
    else next[parent] = nextChildren;
    onChange(next);
  }

  return (
    <div className="max-h-72 overflow-y-auto rounded-md border border-border">
      {Object.entries(taxonomy).map(([parent, children]) => {
        const isExpanded = expanded.has(parent);
        const isParentSelected = parent in selection;
        const selectedChildren = selection[parent] ?? [];
        return (
          <div key={parent} className="border-b border-border last:border-0">
            <div className="flex items-center gap-2 px-3 py-2 hover:bg-page">
              <button
                type="button"
                onClick={() => toggleParent(parent)}
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  isParentSelected ? "border-primary bg-primary" : "border-border bg-white"
                )}
              >
                {isParentSelected && <Check className="h-3 w-3 text-white" />}
              </button>
              <button type="button" onClick={() => toggleExpand(parent)} className="flex flex-1 items-center justify-between text-left text-sm">
                <span className="font-medium text-text-primary">
                  {parent}
                  {selectedChildren.length > 0 && (
                    <span className="ml-1.5 text-xs text-text-secondary">({selectedChildren.length})</span>
                  )}
                </span>
                <ChevronRight className={cn("h-3.5 w-3.5 text-text-secondary transition-transform", isExpanded && "rotate-90")} />
              </button>
            </div>
            {isExpanded && (
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 px-8 pb-2">
                {children.map((child) => (
                  <label key={child} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary">
                    <input
                      type="checkbox"
                      checked={selectedChildren.includes(child)}
                      onChange={() => toggleChild(parent, child)}
                      className="h-3 w-3 rounded border-border"
                    />
                    {child}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
