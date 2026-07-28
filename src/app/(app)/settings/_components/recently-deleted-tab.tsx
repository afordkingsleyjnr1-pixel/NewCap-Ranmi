"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function RecentlyDeletedTab() {
  const [entities, setFirms] = useState<any[]>([]);

  async function load() {
    const res = await fetch("/api/entities?includeDeleted=true");
    const data = await res.json();
    setFirms((data.entities ?? []).filter((f: any) => f.deletedAt));
  }

  useEffect(() => {
    load();
  }, []);

  async function restore(id: string) {
    await fetch(`/api/entities/${id}/restore`, { method: "POST" });
    load();
  }

  async function purge(id: string, name: string) {
    if (
      !confirm(
        `Permanently delete ${name}? This removes it and all its contacts, activity, tasks, and meetings from the platform for good — it can only come back by being added again from scratch. This cannot be undone.`
      )
    ) {
      return;
    }
    await fetch(`/api/entities/${id}/purge`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-2">
      {entities.length === 0 && <p className="text-sm text-text-secondary">Nothing deleted.</p>}
      {entities.map((f) => (
        <div key={f.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-sm">
          <span className="text-text-primary">{f.name}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => restore(f.id)}>
              Restore
            </Button>
            <Button size="sm" variant="destructive" onClick={() => purge(f.id, f.name)}>
              Delete Permanently
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
