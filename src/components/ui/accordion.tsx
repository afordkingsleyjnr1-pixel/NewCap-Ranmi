"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Section 5.4 — parent→child accordion, collapsed parent groups only, expand to reveal children.
export const Accordion = AccordionPrimitive.Root;

export function AccordionItem({ className, ...props }: AccordionPrimitive.AccordionItemProps) {
  return <AccordionPrimitive.Item className={cn("border-b border-border last:border-0", className)} {...props} />;
}

export function AccordionTrigger({ className, children, ...props }: AccordionPrimitive.AccordionTriggerProps) {
  return (
    <AccordionPrimitive.Header>
      <AccordionPrimitive.Trigger
        className={cn(
          "group flex w-full items-center justify-between py-2.5 text-left text-sm font-medium text-text-primary hover:text-accent",
          className
        )}
        {...props}
      >
        {children}
        <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary transition-transform group-data-[state=open]:rotate-90" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({ className, children, ...props }: AccordionPrimitive.AccordionContentProps) {
  return (
    <AccordionPrimitive.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out" {...props}>
      <div className={cn("pb-3", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}
