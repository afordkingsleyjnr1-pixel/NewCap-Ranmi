"use client";

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { TagPill } from "@/components/ui/badge";
import { STRATEGIES_TAXONOMY, FOCUS_AREAS_TAXONOMY } from "@/lib/taxonomy";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function TaxonomyTab() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Strategies (read-only)</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple">
            {Object.entries(STRATEGIES_TAXONOMY).map(([parent, children]) => (
              <AccordionItem key={parent} value={parent}>
                <AccordionTrigger>{parent}</AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-wrap gap-1.5">
                    {children.map((c) => (
                      <TagPill key={c}>{c}</TagPill>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Focus Areas (read-only)</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple">
            {Object.entries(FOCUS_AREAS_TAXONOMY).map(([parent, children]) => (
              <AccordionItem key={parent} value={parent}>
                <AccordionTrigger>{parent}</AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-wrap gap-1.5">
                    {children.map((c) => (
                      <TagPill key={c}>{c}</TagPill>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
