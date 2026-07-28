"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontal row of ticks for a multi-step background process (Add Firm /
 * Populate research). Each step turns green with a checkmark once passed;
 * the current step pulses; the connecting line fills in behind it.
 */
export function StepProgress({ steps, activeIndex }: { steps: string[]; activeIndex: number }) {
  return (
    <div className="flex items-center px-1 py-2">
      {steps.map((label, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <div key={label} className={cn("flex items-center", i < steps.length - 1 && "flex-1")}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-semibold transition-colors duration-300",
                  done && "border-status-green bg-status-green text-white",
                  active && !done && "border-primary bg-white text-primary animate-pulse",
                  !done && !active && "border-border bg-white text-text-secondary"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={cn(
                  "whitespace-nowrap text-[10px]",
                  done ? "text-status-green" : active ? "font-medium text-primary" : "text-text-secondary"
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn("mx-1.5 h-0.5 flex-1 rounded transition-colors duration-500", i < activeIndex ? "bg-status-green" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
