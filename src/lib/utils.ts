import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Section 5.3 — AUM Display Rule: short, scannable strings only. */
export function formatAum(value: number | null | undefined, confidence?: string | null): string {
  if (value === null || value === undefined) return "NA";
  let short: string;
  if (value >= 1_000_000_000) short = `$${(value / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B`;
  else if (value >= 1_000_000) short = `$${(value / 1_000_000).toFixed(0)}M`;
  else short = `$${value.toLocaleString()}`;
  if (confidence === "unconfirmed" || confidence === "dated") return `~${short}*`;
  return short;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
