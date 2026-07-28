"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Clock, Handshake, Trophy } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatDate, formatDateTime, cn } from "@/lib/utils";

interface DashboardStats {
  totalManagers: number;
  followUpsPending: number;
  activeDeals: number;
  closedWon: number;
}

const TILES: Array<{ key: keyof DashboardStats; label: string; icon: typeof Building2; accent: string }> = [
  { key: "totalManagers", label: "Total Managers", icon: Building2, accent: "text-primary" },
  { key: "followUpsPending", label: "Follow-Ups Pending", icon: Clock, accent: "text-status-amber" },
  { key: "activeDeals", label: "Active Deals", icon: Handshake, accent: "text-status-blue" },
  { key: "closedWon", label: "Closed Won", icon: Trophy, accent: "text-status-green" },
];

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-secondary">A quick read on where the pipeline stands</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {TILES.map(({ key, label, icon: Icon, accent }) => (
          <div key={key} className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</span>
              <Icon className={cn("h-4 w-4", accent)} />
            </div>
            <p className="mt-3 text-3xl font-semibold text-text-primary">
              {data ? data.stats[key] : <span className="inline-block h-8 w-12 animate-pulse rounded bg-page" />}
            </p>
          </div>
        ))}
      </div>

      {data && (
        <>
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
              {data.recentActivity.length === 0 && <p className="text-sm text-text-secondary">No activity yet.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
