import { cn } from "@/lib/utils";
import type { StageColor } from "@/lib/crm-stages";

const COLOR_CLASSES: Record<StageColor, string> = {
  green: "bg-status-green-bg text-status-green",
  amber: "bg-status-amber-bg text-status-amber",
  red: "bg-status-red-bg text-status-red",
  blue: "bg-status-blue-bg text-status-blue",
  gray: "bg-status-gray-bg text-status-gray",
};

export function Pill({ color = "gray", children, className }: { color?: StageColor; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap",
        COLOR_CLASSES[color],
        className
      )}
    >
      {children}
    </span>
  );
}

export function TagPill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-border bg-page px-2 py-0.5 text-[11px] font-medium text-text-secondary whitespace-nowrap",
        className
      )}
    >
      {children}
    </span>
  );
}
