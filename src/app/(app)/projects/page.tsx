"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/avatar";
import { Plus, Building2, ListChecks, Calendar } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { AllTasksTab } from "./_components/all-tasks-tab";
import { CreateProjectModal } from "./_components/create-project-modal";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  status: "active" | "on_hold" | "completed";
  startDate: string;
  dueDate: string | null;
  owner: { id: string; name: string };
  members: Array<{ user: { id: string; name: string } }>;
  firms: Array<{ firmId: string }>;
  tasks: Array<{ id: string; status: "open" | "done"; dueDate: string | null }>;
}

const STATUS_COLOR: Record<ProjectRow["status"], "green" | "amber" | "gray"> = {
  active: "green",
  on_hold: "amber",
  completed: "gray",
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data.projects ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Projects</h1>
          <p className="text-sm text-text-secondary">Group firms, contacts, tasks, and team members around one initiative</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Create Project
        </Button>
      </div>

      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="all-tasks">All Tasks</TabsTrigger>
        </TabsList>

        <TabsContent value="projects">
          <div className="pt-4">
            {loading && <p className="py-8 text-center text-sm text-text-secondary">Loading…</p>}
            {!loading && projects.length === 0 && (
              <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-text-secondary">
                No projects yet. Click Create Project to set up your first workspace.
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => {
                const openTasks = p.tasks.filter((t) => t.status === "open").length;
                const doneTasks = p.tasks.filter((t) => t.status === "done").length;
                return (
                  <button
                    key={p.id}
                    onClick={() => router.push(`/projects/${p.id}`)}
                    className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-primary"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-text-primary">{p.name}</h3>
                      <Pill color={STATUS_COLOR[p.status]}>{p.status.replace("_", " ")}</Pill>
                    </div>
                    {p.description && <p className="line-clamp-2 text-xs text-text-secondary">{p.description}</p>}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" /> {p.firms.length} firm{p.firms.length === 1 ? "" : "s"}
                      </span>
                      <span className="flex items-center gap-1">
                        <ListChecks className="h-3.5 w-3.5" /> {openTasks} open · {doneTasks} done
                      </span>
                      {p.dueDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" /> Due {formatDate(p.dueDate)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-2.5">
                      <div className="flex -space-x-1.5">
                        {p.members.slice(0, 4).map((m) => (
                          <Avatar key={m.user.id} name={m.user.name} className="ring-2 ring-surface" />
                        ))}
                      </div>
                      <span className="text-[11px] text-text-secondary">Owner: {p.owner.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="all-tasks">
          <div className="pt-4">
            <AllTasksTab />
          </div>
        </TabsContent>
      </Tabs>

      <CreateProjectModal open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
    </div>
  );
}
