"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { STAGE_LABELS, STAGE_COLORS, type CrmStageKey } from "@/lib/crm-stages";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ArrowLeft, Plus, Trash2, Mail, Loader2 } from "lucide-react";
import { NextStepCell } from "../../crm/_components/next-step-cell";
import { useNextStepActions } from "../../crm/_components/use-next-step-actions";
import { AddFirmsModal } from "./_components/add-firms-modal";
import { AddTaskModal } from "./_components/add-task-modal";
import { AssignMemberModal } from "./_components/assign-member-modal";
import { BulkEmailModal } from "./_components/bulk-email-modal";

interface ProjectFirmRow {
  firmId: string;
  firm: {
    id: string;
    name: string;
    hqLocation: string | null;
    crmStage: { stage: CrmStageKey; owner: { id: string; name: string } | null } | null;
    contacts: Array<{ id: string; name: string; email: string | null; rank: number }>;
    tasks: Array<{ title: string }>;
    meetings: Array<{ id: string; endTime: string; status: string }>;
  };
}

interface TaskRow {
  id: string;
  title: string;
  status: "open" | "done";
  dueDate: string | null;
  isFromTemplate: boolean;
  owner: { id: string; name: string } | null;
  firm: { id: string; name: string };
}

interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  status: "active" | "on_hold" | "completed";
  startDate: string;
  dueDate: string | null;
  owner: { id: string; name: string; email: string };
  members: Array<{ userId: string; user: { id: string; name: string; email: string; status: string } }>;
  firms: ProjectFirmRow[];
  tasks: TaskRow[];
}

interface ActivityRow {
  id: string;
  type: string;
  body: string;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  firm: { id: string; name: string };
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFirmIds, setSelectedFirmIds] = useState<Set<string>>(new Set());
  const [addFirmsOpen, setAddFirmsOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [assignMemberOpen, setAssignMemberOpen] = useState(false);
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/projects/${params.id}`);
    if (res.ok) {
      const data = await res.json();
      setProject(data.project);
      setActivity(data.recentActivity ?? []);
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const { handleAction, modals } = useNextStepActions(load);

  function toggleFirm(firmId: string) {
    setSelectedFirmIds((prev) => {
      const next = new Set(prev);
      next.has(firmId) ? next.delete(firmId) : next.add(firmId);
      return next;
    });
  }

  async function removeFirm(firmId: string) {
    if (!confirm("Remove this firm from the project? It stays in the Firms Database.")) return;
    await fetch(`/api/projects/${params.id}/firms/${firmId}`, { method: "DELETE" });
    load();
  }

  async function deleteProject() {
    if (!project) return;
    if (!confirm(`Delete project "${project.name}"? Firms and contacts stay in the database; tasks stay in the main Tasks module, just unlinked from this project.`)) return;
    await fetch(`/api/projects/${params.id}`, { method: "DELETE" });
    router.push("/projects");
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this team member from the project?")) return;
    await fetch(`/api/projects/${params.id}/members/${userId}`, { method: "DELETE" });
    load();
  }

  async function toggleTaskDone(task: TaskRow) {
    await fetch(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: task.status === "done" ? "open" : "done" }) });
    load();
  }

  async function deleteTask(id: string) {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    load();
  }

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center py-24 text-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const openTasks = project.tasks.filter((t) => t.status === "open");
  const doneTasks = project.tasks.filter((t) => t.status === "done");
  const now = new Date();
  const upcomingDeadlines = openTasks.filter((t) => t.dueDate).sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  const existingFirmIds = project.firms.map((f) => f.firmId);
  const selectedTargets = project.firms
    .filter((f) => selectedFirmIds.has(f.firmId))
    .map((f) => ({ firmId: f.firmId, contactId: f.firm.contacts.find((c) => c.email)?.id, firmName: f.firm.name }));

  return (
    <div className="space-y-4">
      <button onClick={() => router.push("/projects")} className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Projects
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-text-primary">{project.name}</h1>
            <Pill color={project.status === "active" ? "green" : project.status === "on_hold" ? "amber" : "gray"}>
              {project.status.replace("_", " ")}
            </Pill>
            {project.type && <Pill color="gray">{project.type}</Pill>}
          </div>
          {project.description && <p className="mt-1 max-w-2xl text-sm text-text-secondary">{project.description}</p>}
          <p className="mt-1 text-xs text-text-secondary">
            Owner: {project.owner.name} · Start {formatDate(project.startDate)}
            {project.dueDate ? ` · Due ${formatDate(project.dueDate)}` : ""}
          </p>
        </div>
        <Button size="sm" variant="destructive" onClick={deleteProject}>
          <Trash2 className="h-3.5 w-3.5" /> Delete Project
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Firms", value: project.firms.length },
          { label: "Open Tasks", value: openTasks.length },
          { label: "Completed Tasks", value: doneTasks.length },
          { label: "Upcoming Deadlines", value: upcomingDeadlines.length },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-surface p-3">
            <p className="text-xs text-text-secondary">{s.label}</p>
            <p className="text-lg font-semibold text-text-primary">{s.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="firms">Firms ({project.firms.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({openTasks.length})</TabsTrigger>
          <TabsTrigger value="members">Members ({project.members.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-4 pt-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-text-primary">Upcoming Deadlines</h3>
              {upcomingDeadlines.length === 0 && <p className="text-xs text-text-secondary">No upcoming task deadlines.</p>}
              <div className="space-y-1.5">
                {upcomingDeadlines.slice(0, 5).map((t) => {
                  const overdue = t.dueDate && new Date(t.dueDate) < now;
                  return (
                    <div key={t.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                      <span className="text-text-primary">
                        {t.title} <span className="text-text-secondary">— {t.firm.name}</span>
                      </span>
                      {overdue ? <Pill color="red">{formatDate(t.dueDate)} overdue</Pill> : <span className="text-xs text-text-secondary">{formatDate(t.dueDate)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-text-primary">Recent Activity</h3>
              {activity.length === 0 && <p className="text-xs text-text-secondary">No activity yet.</p>}
              <div className="space-y-2">
                {activity.map((a) => (
                  <div key={a.id} className="border-b border-border py-2 text-sm last:border-0">
                    <p className="text-text-primary">
                      {a.body} <span className="text-text-secondary">— {a.firm.name}</span>
                    </p>
                    <p className="text-xs text-text-secondary">
                      {formatDateTime(a.createdAt)} {a.createdBy ? `· ${a.createdBy.name}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="firms">
          <div className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <Button size="sm" variant="outline" onClick={() => setAddFirmsOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Firms
              </Button>
              {selectedFirmIds.size > 0 && (
                <Button size="sm" onClick={() => setBulkEmailOpen(true)}>
                  <Mail className="h-3.5 w-3.5" /> Send Bulk Email ({selectedFirmIds.size})
                </Button>
              )}
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-8"></th>
                    <th>Firm</th>
                    <th>Stage</th>
                    <th>Next Step</th>
                    <th>Primary Contact</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {project.firms.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-text-secondary">
                        No firms in this project yet.
                      </td>
                    </tr>
                  )}
                  {project.firms.map(({ firm }) => (
                    <tr key={firm.id}>
                      <td>
                        <Checkbox checked={selectedFirmIds.has(firm.id)} onCheckedChange={() => toggleFirm(firm.id)} />
                      </td>
                      <td className="font-medium text-text-primary">
                        <a href={`/firms?open=${firm.id}`} className="hover:underline">
                          {firm.name}
                        </a>
                      </td>
                      <td>{firm.crmStage && <Pill color={STAGE_COLORS[firm.crmStage.stage]}>{STAGE_LABELS[firm.crmStage.stage]}</Pill>}</td>
                      <td>
                        <NextStepCell firm={firm} onAction={handleAction} />
                      </td>
                      <td className="text-text-secondary">{firm.contacts[0]?.name ?? "—"}</td>
                      <td>
                        <button onClick={() => removeFirm(firm.id)} className="rounded p-1 text-text-secondary hover:bg-page hover:text-status-red">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tasks">
          <div className="space-y-3 pt-4">
            <Button size="sm" variant="outline" onClick={() => setAddTaskOpen(true)} disabled={project.firms.length === 0}>
              <Plus className="h-3.5 w-3.5" /> Add Task
            </Button>
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
                  {project.tasks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-text-secondary">
                        No tasks yet.
                      </td>
                    </tr>
                  )}
                  {project.tasks.map((t) => {
                    const overdue = t.dueDate && t.status === "open" && new Date(t.dueDate) < now;
                    return (
                      <tr key={t.id}>
                        <td>
                          <Checkbox checked={t.status === "done"} onCheckedChange={() => toggleTaskDone(t)} />
                        </td>
                        <td className={t.status === "done" ? "text-text-secondary line-through" : "text-text-primary"}>
                          {t.title}
                          {t.isFromTemplate && <Pill color="gray" className="ml-2">CRM Action</Pill>}
                        </td>
                        <td className="text-accent">{t.firm.name}</td>
                        <td>{overdue ? <Pill color="red">{formatDate(t.dueDate)} overdue</Pill> : t.dueDate ? formatDate(t.dueDate) : "—"}</td>
                        <td className="text-text-secondary">{t.owner?.name ?? "—"}</td>
                        <td>
                          <button onClick={() => deleteTask(t.id)} className="rounded p-1 text-text-secondary hover:bg-page hover:text-status-red">
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
        </TabsContent>

        <TabsContent value="members">
          <div className="space-y-3 pt-4">
            <Button size="sm" variant="outline" onClick={() => setAssignMemberOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Assign User
            </Button>
            <div className="space-y-2">
              {project.members.map((m) => (
                <div key={m.userId} className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={m.user.name} />
                    <div>
                      <p className="text-sm font-medium text-text-primary">{m.user.name}</p>
                      <p className="text-xs text-text-secondary">{m.user.email}</p>
                    </div>
                    {m.user.status === "pending_invite" && <Pill color="amber">Invite Pending</Pill>}
                  </div>
                  {m.userId !== project.owner.id && (
                    <button onClick={() => removeMember(m.userId)} className="rounded p-1 text-text-secondary hover:bg-page hover:text-status-red">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <AddFirmsModal open={addFirmsOpen} onOpenChange={setAddFirmsOpen} projectId={project.id} existingFirmIds={existingFirmIds} onAdded={load} />
      <AddTaskModal open={addTaskOpen} onOpenChange={setAddTaskOpen} projectId={project.id} firms={project.firms.map((f) => f.firm)} onAdded={load} />
      <AssignMemberModal open={assignMemberOpen} onOpenChange={setAssignMemberOpen} projectId={project.id} onAdded={load} />
      <BulkEmailModal
        open={bulkEmailOpen}
        onOpenChange={setBulkEmailOpen}
        projectId={project.id}
        targets={selectedTargets}
        onSent={() => {
          setSelectedFirmIds(new Set());
          load();
        }}
      />
      {modals}
    </div>
  );
}
