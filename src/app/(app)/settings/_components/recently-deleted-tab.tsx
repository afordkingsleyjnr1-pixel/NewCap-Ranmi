"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function RecentlyDeletedTab() {
  const [firms, setFirms] = useState<any[]>([]);

  async function load() {
    const res = await fetch("/api/firms?includeDeleted=true");
    const data = await res.json();
    setFirms((data.firms ?? []).filter((f: any) => f.deletedAt));
  }

  useEffect(() => {
    load();
  }, []);

  async function restore(id: string) {
    await fetch(`/api/firms/${id}/restore`, { method: "POST" });
    load();
  }

  return (
    <div className="space-y-2">
      {firms.length === 0 && <p className="text-sm text-text-secondary">Nothing deleted.</p>}
      {firms.map((f) => (
        <div key={f.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-sm">
          <span className="text-text-primary">{f.name}</span>
          <Button size="sm" variant="outline" onClick={() => restore(f.id)}>
            Restore
          </Button>
        </div>
      ))}
    </div>
  );
}
