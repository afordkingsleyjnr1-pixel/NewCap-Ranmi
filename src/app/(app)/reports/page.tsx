"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { STAGE_LABELS, STAGE_COLORS, CRM_STAGES } from "@/lib/crm-stages";
import { Pill } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export default function ReportsPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/reports/summary")
      .then((r) => r.json())
      .then(setData);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Reports</h1>
          <p className="text-sm text-text-secondary">Pipeline conversion, outreach performance, and closed deals</p>
        </div>
        <a href="/api/reports/export">
          <Button variant="outline">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </a>
      </div>

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Pipeline Conversion Funnel</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {CRM_STAGES.map((stage) => (
                <div key={stage} className="flex min-w-[140px] flex-col gap-1 rounded-md border border-border p-3">
                  <Pill color={STAGE_COLORS[stage]}>{STAGE_LABELS[stage]}</Pill>
                  <span className="text-xl font-semibold text-text-primary">{data.funnel[stage] ?? 0}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Outreach-to-Response Rate</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-8">
              <div>
                <p className="text-xs text-text-secondary">Sent</p>
                <p className="text-2xl font-semibold text-text-primary">{data.outreach.sent}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Replied</p>
                <p className="text-2xl font-semibold text-text-primary">{data.outreach.replied}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Response Rate</p>
                <p className="text-2xl font-semibold text-text-primary">{data.outreach.responseRate}%</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Closed — Won</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.closedWon.length === 0 && <p className="text-sm text-text-secondary">No closed-won deals yet.</p>}
              {data.closedWon.map((row: any) => (
                <div key={row.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                  <span className="font-medium text-text-primary">{row.firm.name}</span>
                  <span className="text-text-secondary">{row.dealNotes ?? "—"}</span>
                  <span className="text-text-secondary">{formatDate(row.stageChangedAt)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
