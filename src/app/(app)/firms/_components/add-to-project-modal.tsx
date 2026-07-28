"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface ProjectOption {
  id: string;
  name: string;
}

export function AddToProjectModal({
  open,
  onOpenChange,
  firmId,
  firmName,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  firmId: string | null;
  firmName?: string;
  onAdded: () => void;
}) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      fetch("/api/projects")
        .then((r) => r.json())
        .then((d) => setProjects((d.projects ?? []).map((p: any) => ({ id: p.id, name: p.name }))));
      setError(null);
      setAddedTo(new Set());
    }
  }, [open]);

  async function addTo(projectId: string) {
    if (!firmId) return;
    setLoading(projectId);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/firms`, { method: "POST", body: JSON.stringify({ firmIds: [firmId] }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add to project");
      }
      setAddedTo((prev) => new Set(prev).add(projectId));
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add to Project" description={firmName} widthClassName="max-w-sm">
      <div className="space-y-3">
        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          {projects.length === 0 && <p className="p-3 text-xs text-text-secondary">No projects yet — create one from the Projects page.</p>}
          {projects.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b border-border px-3 py-2 text-sm last:border-0">
              <span className="text-text-primary">{p.name}</span>
              {addedTo.has(p.id) ? (
                <span className="text-xs text-status-green">Added</span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => addTo(p.id)} disabled={loading === p.id}>
                  {loading === p.id && <Loader2 className="h-3 w-3 animate-spin" />} Add
                </Button>
              )}
            </div>
          ))}
        </div>
        {error && <p className="text-xs text-status-red">{error}</p>}
        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
