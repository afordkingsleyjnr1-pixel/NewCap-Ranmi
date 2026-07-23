"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { formatDateTime, cn } from "@/lib/utils";
import { Mail, Plus, RefreshCw } from "lucide-react";
import { NewMessageModal } from "./_components/new-message-modal";

interface Message {
  id: string;
  direction: "outbound" | "inbound";
  body: string;
  sentAt: string;
  isFollowUp: boolean;
}

interface Thread {
  id: string;
  subject: string;
  status: string;
  isFreeForm: boolean;
  lastActivityAt: string;
  adHocRecipientName: string | null;
  adHocRecipientEmail: string | null;
  firm: { id: string; name: string } | null;
  contact: { id: string; name: string; email: string | null } | null;
  messages: Message[];
}

export default function MessagesPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    const res = await fetch("/api/messages");
    const data = await res.json();
    setThreads(data.threads ?? []);
    if (showSpinner) setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Replies pull in via /api/messages's sync (see reply-sync.ts) — poll in
  // the background so a reply shows up while this page is open, not just on
  // a manual refresh.
  useEffect(() => {
    const interval = setInterval(() => load(false), 20_000);
    return () => clearInterval(interval);
  }, [load]);

  const active = threads.find((t) => t.id === openId) ?? threads[0] ?? null;

  useEffect(() => {
    if (!openId && threads.length > 0) setOpenId(threads[0].id);
  }, [threads, openId]);

  function recipientLabel(t: Thread): string {
    if (t.contact) return `${t.contact.name}${t.contact.email ? ` <${t.contact.email}>` : ""}`;
    if (t.adHocRecipientName || t.adHocRecipientEmail) return `${t.adHocRecipientName ?? ""} ${t.adHocRecipientEmail ? `<${t.adHocRecipientEmail}>` : ""}`.trim();
    return "Unknown recipient";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Messages</h1>
          <p className="text-sm text-text-secondary">Every email thread across every firm, plus free-form messages sent from here</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setComposeOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New Message
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[320px_1fr] gap-4">
        <div className="max-h-[calc(100vh-180px)] overflow-y-auto rounded-lg border border-border bg-surface">
          {loading && <div className="p-4 text-sm text-text-secondary">Loading…</div>}
          {!loading && threads.length === 0 && (
            <div className="p-4 text-sm text-text-secondary">No messages yet. Click New Message to send the first one.</div>
          )}
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => setOpenId(t.id)}
              className={cn(
                "block w-full border-b border-border px-4 py-3 text-left last:border-0 hover:bg-page",
                active?.id === t.id && "bg-page"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-text-primary">{t.subject}</span>
                {t.isFreeForm && <Pill color="gray">General</Pill>}
              </div>
              <p className="truncate text-xs text-text-secondary">{t.firm ? t.firm.name : recipientLabel(t)}</p>
              <p className="mt-0.5 text-[11px] text-text-secondary">{formatDateTime(t.lastActivityAt)}</p>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface">
          {!active ? (
            <div className="flex h-full items-center justify-center py-20 text-text-secondary">
              <Mail className="mr-2 h-4 w-4" /> Select a thread
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold text-text-primary">{active.subject}</h2>
                <p className="text-xs text-text-secondary">
                  {active.firm ? (
                    <>
                      {active.firm.name} · {recipientLabel(active)}
                    </>
                  ) : (
                    recipientLabel(active)
                  )}
                </p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {active.messages.map((m) => (
                  <div key={m.id} className={cn("max-w-[80%] rounded-md px-3 py-2.5 text-sm", m.direction === "outbound" ? "ml-auto bg-primary text-white" : "bg-page text-text-primary")}>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={cn("mt-1 text-[11px]", m.direction === "outbound" ? "text-white/70" : "text-text-secondary")}>
                      {m.direction === "outbound" ? "Sent" : "Received"} · {formatDateTime(m.sentAt)}
                    </p>
                  </div>
                ))}
                {active.messages.length === 0 && <p className="text-xs text-text-secondary">No messages in this thread.</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      <NewMessageModal open={composeOpen} onOpenChange={setComposeOpen} onSent={load} />
    </div>
  );
}
