"use client";

import { useEffect, useState } from "react";
import { Building2, Clock, Handshake, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setStats);
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
              {stats ? stats[key] : <span className="inline-block h-8 w-12 animate-pulse rounded bg-page" />}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
