"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pill } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatRelativeListTime, cn } from "@/lib/utils";

interface ThreadRow {
  id: string;
  subject: string;
  hasUnreadReply: boolean;
  lastActivityAt: string;
  entity: { id: string; name: string } | null;
  contact: { id: string; name: string } | null;
  adHocRecipientName: string | null;
  messages: Array<{ body: string }>;
}

// Project-scoped Messages — every thread whose entity is attached to this
// project, automatically (no manual tagging), same association rule as
// the Entity Database's project filter. Read-only summary here; opening a
// thread goes to the full main Messages reader.
//
// `compact` renders a tighter list (smaller text, no outer padding) for use
// as the mini panel on the Overview tab; `limit` caps how many threads show
// there. The full, uncapped list is used when neither is set.
export function ProjectMessagesTab({ projectId, compact = false, limit }: { projectId: string; compact?: boolean; limit?: number }) {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/messages?folder=all&projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => setThreads(d.threads ?? []))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center text-text-secondary", compact ? "py-8" : "py-16")}>
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const shown = limit ? threads.slice(0, limit) : threads;

  return (
    <div className={cn("space-y-2", !compact && "pt-4")}>
      {shown.length === 0 && <p className="text-sm text-text-secondary">No messages yet for entities in this project.</p>}
      <div className="rounded-lg border border-border bg-surface">
        {shown.map((t) => (
          <Link
            key={t.id}
            href={`/messages?open=${t.id}`}
            className={cn(
              "flex items-center justify-between gap-3 border-b border-border text-sm last:border-0 hover:bg-page",
              compact ? "px-3 py-2" : "px-4 py-3"
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn(t.hasUnreadReply ? "font-bold text-text-primary" : "font-medium text-text-primary", compact && "text-xs")}>
                  {t.subject}
                </span>
                {t.hasUnreadReply && <Pill color="blue">Unread</Pill>}
              </div>
              <p className="truncate text-xs text-text-secondary">
                {t.entity?.name ?? t.contact?.name ?? t.adHocRecipientName ?? "Unknown"}
                {!compact && ` — ${t.messages[t.messages.length - 1]?.body.replace(/\s+/g, " ").slice(0, 120)}`}
              </p>
            </div>
            <span className="shrink-0 text-xs text-text-secondary">{formatRelativeListTime(t.lastActivityAt)}</span>
          </Link>
        ))}
      </div>
      {limit && threads.length > limit && (
        <p className="text-xs text-text-secondary">
          +{threads.length - limit} more —{" "}
          <Link href={`/messages`} className="text-accent hover:underline">
            view all
          </Link>
        </p>
      )}
    </div>
  );
}
