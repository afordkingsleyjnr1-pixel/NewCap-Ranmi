"use client";

import { useCallback, useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Pill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";

interface TaskRow {
  id: string;
  title: string;
  dueDate: string | null;
  status: "open" | "done";
  isFromTemplate: boolean;
  firm: { id: string; name: string };
  owner: { name: string } | null;
}

export default function ProjectsPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setTasks(data.tasks ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleDone(task: TaskRow) {
    await fetch(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: task.status === "done" ? "open" : "done" }) });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    load();
  }

  const now = new Date();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Projects</h1>
        <p className="text-sm text-text-secondary">Every open task across every firm, sorted by due date</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8"></th>
              <th>Task</th>
              <th>Firm</th>
              <th>Due Date</th>
              <th>Owner</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-text-secondary">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && tasks.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-text-secondary">
                  No open tasks. Checklists auto-generate when a firm reaches Term Sheet / LOI.
                </td>
              </tr>
            )}
            {tasks.map((t) => {
              const overdue = t.dueDate && t.status === "open" && new Date(t.dueDate) < now;
              return (
                <tr key={t.id}>
                  <td>
                    <Checkbox checked={t.status === "done"} onCheckedChange={() => toggleDone(t)} />
                  </td>
                  <td className={cn(t.status === "done" && "text-text-secondary line-through")}>
                    {t.title}
                    {t.isFromTemplate && <Pill color="gray" className="ml-2">Checklist</Pill>}
                  </td>
                  <td className="text-accent">{t.firm.name}</td>
                  <td>{overdue ? <Pill color="red">{formatDate(t.dueDate)} overdue</Pill> : t.dueDate ? formatDate(t.dueDate) : "—"}</td>
                  <td className="text-text-secondary">{t.owner?.name ?? "—"}</td>
                  <td>
                    <button onClick={() => remove(t.id)} className="rounded p-1 text-text-secondary hover:bg-page hover:text-status-red">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
