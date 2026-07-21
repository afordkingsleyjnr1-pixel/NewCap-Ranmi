import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white",
        className
      )}
    >
      {initials(name) || "?"}
    </span>
  );
}
