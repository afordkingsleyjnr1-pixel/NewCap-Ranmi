"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { STAGE_LABELS, STAGE_COLORS, CRM_STAGES } from "@/lib/crm-stages";
import { formatDate, formatDateTime } from "@/lib/utils";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <div className="py-12 text-center text-text-secondary">Loading…</div>;

  const totalFirms = Object.values(data.funnel).reduce((a: number, b) => a + (b as number), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-secondary">{totalFirms} firms across the pipeline</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline Funnel</CardTitle>
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

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Follow-Ups Due (today / this week)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.followUpsDue.length === 0 && <p className="text-sm text-text-secondary">Nothing due.</p>}
            {data.followUpsDue.map((row: any) => (
              <Link key={row.id} href={`/firms?open=${row.firmId}`} className="flex items-center justify-between text-sm hover:text-accent">
                <span>{row.firm.name}</span>
                <span className="text-text-secondary">{formatDate(row.nextFollowUpDate)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recently Replied — Awaiting Triage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.awaitingTriage.length === 0 && <p className="text-sm text-text-secondary">Nothing to triage.</p>}
            {data.awaitingTriage.map((t: any) => (
              <Link key={t.id} href={`/firms?open=${t.firmId}`} className="flex items-center justify-between text-sm hover:text-accent">
                <span>{t.firm.name}</span>
                <span className="text-text-secondary">{formatDateTime(t.lastActivityAt)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Meetings (next 7 days)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.upcomingMeetings.length === 0 && <p className="text-sm text-text-secondary">No meetings scheduled.</p>}
            {data.upcomingMeetings.map((m: any) => (
              <Link key={m.id} href={`/firms?open=${m.firmId}`} className="flex items-center justify-between text-sm hover:text-accent">
                <span>
                  {m.firm.name} {m.contact ? `— ${m.contact.name}` : ""}
                </span>
                <span className="text-text-secondary">{formatDateTime(m.startTime)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recently Closed — Won</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentlyClosedWon.length === 0 && <p className="text-sm text-text-secondary">None yet.</p>}
            {data.recentlyClosedWon.map((row: any) => (
              <Link key={row.id} href={`/firms?open=${row.firmId}`} className="flex items-center justify-between text-sm hover:text-accent">
                <span>{row.firm.name}</span>
                <span className="text-text-secondary">{formatDate(row.stageChangedAt)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.recentActivity.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
              <span className="text-text-primary">
                <span className="font-medium">{a.firm.name}</span> — {a.body}
              </span>
              <span className="text-text-secondary">{formatDateTime(a.createdAt)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
