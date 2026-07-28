"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Select, Textarea, Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Loader2, CheckCircle2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

type TrackerStatus = "not_started" | "in_progress" | "under_review" | "completed" | "blocked";

const TRACKER_LABELS: Record<TrackerStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  under_review: "Under Review",
  completed: "Completed",
  blocked: "Blocked",
};

const TRACKER_COLORS: Record<TrackerStatus, "gray" | "blue" | "amber" | "green" | "red"> = {
  not_started: "gray",
  in_progress: "blue",
  under_review: "amber",
  completed: "green",
  blocked: "red",
};

interface TaskDetail {
  id: string;
  title: string;
  trackerStatus: TrackerStatus;
  progressPercent: number;
  timeSpentMinutes: number;
  completionVerifiedBy: { id: string; name: string } | null;
  completionVerifiedAt: string | null;
  firm: { id: string; name: string };
}

interface CommentRow {
  id: string;
  body: string;
  isSystem: boolean;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

export function TaskDetailModal({
  open,
  onOpenChange,
  task,
  canVerifyCompletion,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task: TaskDetail | null;
  canVerifyCompletion: boolean;
  onChanged: () => void;
}) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [timeToLog, setTimeToLog] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && task) loadComments();
  }, [open, task?.id]);

  async function loadComments() {
    if (!task) return;
    setLoadingComments(true);
    const res = await fetch(`/api/tasks/${task.id}/comments`);
    const data = await res.json();
    setComments(data.comments ?? []);
    setLoadingComments(false);
  }

  async function patchTask(body: Record<string, unknown>) {
    if (!task) return;
    setSaving(true);
    await fetch(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(body) });
    await loadComments();
    onChanged();
    setSaving(false);
  }

  async function submitComment() {
    if (!task || !newComment.trim()) return;
    setSaving(true);
    await fetch(`/api/tasks/${task.id}/comments`, { method: "POST", body: JSON.stringify({ body: newComment.trim() }) });
    setNewComment("");
    await loadComments();
    setSaving(false);
  }

  async function logTime() {
    const minutes = Math.round(Number(timeToLog));
    if (!minutes || minutes <= 0) return;
    await patchTask({ timeSpentMinutes: minutes });
    setTimeToLog("");
  }

  if (!task) return null;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={task.title} widthClassName="max-w-2xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={task.trackerStatus}
            onChange={(e) => patchTask({ trackerStatus: e.target.value })}
            className="w-44"
            disabled={saving}
          >
            {(Object.keys(TRACKER_LABELS) as TrackerStatus[]).map((s) => (
              <option key={s} value={s}>
                {TRACKER_LABELS[s]}
              </option>
            ))}
          </Select>
          <Pill color={TRACKER_COLORS[task.trackerStatus]}>{TRACKER_LABELS[task.trackerStatus]}</Pill>
          {task.trackerStatus === "completed" &&
            (task.completionVerifiedBy ? (
              <Pill color="green" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Verified by {task.completionVerifiedBy.name}
              </Pill>
            ) : canVerifyCompletion ? (
              <Button size="sm" variant="outline" onClick={() => patchTask({ action: "verify_completion" })} disabled={saving}>
                Verify Completion
              </Button>
            ) : (
              <Pill color="amber">Awaiting verification</Pill>
            ))}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-text-secondary">
            <span>Progress</span>
            <span>{task.progressPercent}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={task.progressPercent}
            onChange={(e) => patchTask({ progressPercent: Number(e.target.value) })}
            disabled={saving}
            className="w-full accent-primary"
          />
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <p className="mb-1 text-xs text-text-secondary">Time spent: {task.timeSpentMinutes} min</p>
            <Input
              type="number"
              min={1}
              placeholder="Log minutes worked…"
              value={timeToLog}
              onChange={(e) => setTimeToLog(e.target.value)}
            />
          </div>
          <Button size="sm" variant="outline" onClick={logTime} disabled={saving || !timeToLog}>
            Log Time
          </Button>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-text-secondary">Activity & Comments</p>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-3">
            {loadingComments && (
              <p className="flex items-center gap-2 text-xs text-text-secondary">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </p>
            )}
            {!loadingComments && comments.length === 0 && <p className="text-xs text-text-secondary">No activity yet.</p>}
            {comments.map((c) => (
              <div key={c.id} className={`text-sm ${c.isSystem ? "text-text-secondary italic" : "text-text-primary"}`}>
                {!c.isSystem && c.createdBy && <span className="font-medium">{c.createdBy.name}: </span>}
                {c.body}
                <span className="ml-2 text-xs text-text-secondary">{formatDateTime(c.createdAt)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-end gap-2">
            <Textarea
              placeholder="Add a comment…"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="flex-1"
              rows={2}
            />
            <Button size="sm" onClick={submitComment} disabled={saving || !newComment.trim()}>
              Post
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
