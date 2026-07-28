"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pill } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatRelativeListTime } from "@/lib/utils";

interface ThreadRow {
  id: string;
  subject: string;
  hasUnreadReply: boolean;
  lastActivityAt: string;
  firm: { id: string; name: string } | null;
  contact: { id: string; name: string } | null;
  adHocRecipientName: string | null;
  messages: Array<{ body: string }>;
}

// Project-scoped Messages — every thread whose firm is attached to this
// project, automatically (no manual tagging), same association rule as
// the Firm Database's project filter. Read-only summary here; opening a
// thread goes to the full main Messages reader.
export function ProjectMessagesTab({ projectId }: { projectId: string }) {
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
      <div className="flex items-center justify-center py-16 text-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-4">
      {threads.length === 0 && <p className="text-sm text-text-secondary">No messages yet for firms in this project.</p>}
      <div className="rounded-lg border border-border bg-surface">
        {threads.map((t) => (
          <Link
            key={t.id}
            href={`/messages?open=${t.id}`}
            className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-sm last:border-0 hover:bg-page"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={t.hasUnreadReply ? "font-bold text-text-primary" : "font-medium text-text-primary"}>{t.subject}</span>
                {t.hasUnreadReply && <Pill color="blue">Unread</Pill>}
              </div>
              <p className="truncate text-xs text-text-secondary">
                {t.firm?.name ?? t.contact?.name ?? t.adHocRecipientName ?? "Unknown"} — {t.messages[t.messages.length - 1]?.body.replace(/\s+/g, " ").slice(0, 120)}
              </p>
            </div>
            <span className="shrink-0 text-xs text-text-secondary">{formatRelativeListTime(t.lastActivityAt)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
