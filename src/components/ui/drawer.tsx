"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Section 3 — side drawer/detail panel for long-form detail (never inline in the grid).
export function Drawer({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  widthClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  widthClassName?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className={cn(
            "fixed right-0 top-0 z-50 h-full w-full overflow-y-auto border-l border-border bg-surface shadow-xl focus:outline-none",
            widthClassName ?? "max-w-2xl"
          )}
        >
          <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-surface px-6 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold text-text-primary">{title}</Dialog.Title>
              {subtitle && <Dialog.Description className="mt-0.5 text-sm text-text-secondary">{subtitle}</Dialog.Description>}
            </div>
            <Dialog.Close className="rounded-md p-1.5 text-text-secondary hover:bg-page">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="px-6 py-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  widthClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  widthClassName?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-xl focus:outline-none",
            widthClassName ?? "max-w-lg"
          )}
        >
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-text-primary">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-1 text-sm text-text-secondary">{description}</Dialog.Description>}
            </div>
            <Dialog.Close className="rounded-md p-1.5 text-text-secondary hover:bg-page">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
