"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill, TagPill } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { formatDateTime, cn } from "@/lib/utils";
import { Mail, Plus, RefreshCw, ChevronDown, ChevronRight, Reply, Forward, Paperclip, X, Loader2 } from "lucide-react";
import { NewMessageModal } from "./_components/new-message-modal";

interface Attachment {
  filename: string;
  mimeType: string;
}

interface Message {
  id: string;
  direction: "outbound" | "inbound";
  body: string;
  sentAt: string;
  isFollowUp: boolean;
  attachments: Attachment[] | null;
}

interface Thread {
  id: string;
  subject: string;
  status: string;
  isFreeForm: boolean;
  lastActivityAt: string;
  hasUnreadReply: boolean;
  adHocRecipientName: string | null;
  adHocRecipientEmail: string | null;
  firm: { id: string; name: string } | null;
  contact: { id: string; name: string; email: string | null } | null;
  messages: Message[];
}

interface PendingAttachment {
  filename: string;
  mimeType: string;
  contentBase64: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function MessagesPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<PendingAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [sending, setSending] = useState(false);
  const [forwardFrom, setForwardFrom] = useState<{ subject: string; body: string } | null>(null);

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

  // Gmail-style default: only the most recent message in the thread is
  // expanded, everything before it is collapsed to a one-line summary.
  useEffect(() => {
    if (active) {
      const last = active.messages[active.messages.length - 1];
      setExpandedIds(last ? new Set([last.id]) : new Set());
      setReplyOpen(false);
      setReplyBody("");
      setReplyAttachments([]);
      if (active.hasUnreadReply) {
        fetch(`/api/messages/${active.id}`, { method: "PATCH", body: JSON.stringify({ isRead: true }) })
          .then(() => setThreads((prev) => prev.map((t) => (t.id === active.id ? { ...t, hasUnreadReply: false } : t))))
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function recipientLabel(t: Thread): string {
    if (t.contact) return `${t.contact.name}${t.contact.email ? ` <${t.contact.email}>` : ""}`;
    if (t.adHocRecipientName || t.adHocRecipientEmail) return `${t.adHocRecipientName ?? ""} ${t.adHocRecipientEmail ? `<${t.adHocRecipientEmail}>` : ""}`.trim();
    return "Unknown recipient";
  }

  function senderLabel(t: Thread, m: Message): string {
    if (m.direction === "outbound") return "You";
    return t.contact?.name ?? t.adHocRecipientName ?? recipientLabel(t);
  }

  function initials(label: string): string {
    const parts = label.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }

  async function handleReplyFiles(files: FileList | null) {
    if (!files?.length) return;
    setAttaching(true);
    try {
      const next: PendingAttachment[] = [];
      for (const file of Array.from(files)) {
        const contentBase64 = await fileToBase64(file);
        next.push({ filename: file.name, mimeType: file.type || "application/octet-stream", contentBase64 });
      }
      setReplyAttachments((prev) => [...prev, ...next]);
    } finally {
      setAttaching(false);
    }
  }

  function removeReplyAttachment(filename: string) {
    setReplyAttachments((prev) => prev.filter((a) => a.filename !== filename));
  }

  async function sendReply() {
    if (!active || !replyBody.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        body: JSON.stringify({
          replyToThreadId: active.id,
          subject: active.subject,
          message: replyBody,
          attachments: replyAttachments.length ? replyAttachments : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Send failed");
      setReplyOpen(false);
      setReplyBody("");
      setReplyAttachments([]);
      load(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  function openForward(m: Message) {
    setForwardFrom({ subject: active?.subject ?? "", body: m.body });
    setComposeOpen(true);
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
          <Button
            size="sm"
            onClick={() => {
              setForwardFrom(null);
              setComposeOpen(true);
            }}
          >
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
                <span className={cn("truncate text-sm text-text-primary", t.hasUnreadReply ? "font-bold" : "font-medium")}>{t.subject}</span>
                <div className="flex shrink-0 items-center gap-1">
                  {t.hasUnreadReply && <span className="h-2 w-2 rounded-full bg-accent" />}
                  {t.isFreeForm && <Pill color="gray">General</Pill>}
                </div>
              </div>
              <p className={cn("truncate text-xs", t.hasUnreadReply ? "font-semibold text-text-primary" : "text-text-secondary")}>
                {t.firm ? t.firm.name : recipientLabel(t)}
              </p>
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

              <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
                {active.messages.length === 0 && <p className="text-xs text-text-secondary">No messages in this thread.</p>}
                {[...active.messages].reverse().map((m) => {
                  const expanded = expandedIds.has(m.id);
                  const label = senderLabel(active, m);
                  return (
                    <div key={m.id} className="rounded-md border border-border">
                      <button
                        onClick={() => toggleExpanded(m.id)}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-page"
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white",
                            m.direction === "outbound" ? "bg-primary" : "bg-accent"
                          )}
                        >
                          {initials(label)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text-primary">{label}</span>
                            <span className="text-[11px] text-text-secondary">{formatDateTime(m.sentAt)}</span>
                          </span>
                          {!expanded && <span className="block truncate text-xs text-text-secondary">{m.body.replace(/\s+/g, " ")}</span>}
                        </span>
                        {expanded ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
                        )}
                      </button>
                      {expanded && (
                        <div className="border-t border-border px-3 py-3">
                          <p className="whitespace-pre-wrap text-sm text-text-primary">{m.body}</p>
                          {m.attachments && m.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {m.attachments.map((a) => (
                                <TagPill key={a.filename} className="flex items-center gap-1">
                                  <Paperclip className="h-3 w-3" /> {a.filename}
                                </TagPill>
                              ))}
                            </div>
                          )}
                          <div className="mt-2 flex gap-3">
                            <button
                              onClick={() => setReplyOpen(true)}
                              className="flex items-center gap-1 text-xs text-accent hover:underline"
                            >
                              <Reply className="h-3 w-3" /> Reply
                            </button>
                            <button
                              onClick={() => openForward(m)}
                              className="flex items-center gap-1 text-xs text-accent hover:underline"
                            >
                              <Forward className="h-3 w-3" /> Forward
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-border px-5 py-3">
                {!replyOpen ? (
                  <Button size="sm" variant="outline" onClick={() => setReplyOpen(true)}>
                    <Reply className="h-3.5 w-3.5" /> Reply
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Textarea rows={4} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder={`Reply to ${recipientLabel(active)}…`} />
                    {replyAttachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {replyAttachments.map((a) => (
                          <TagPill key={a.filename} className="flex items-center gap-1">
                            <Paperclip className="h-3 w-3" /> {a.filename}
                            <button onClick={() => removeReplyAttachment(a.filename)} className="hover:text-status-red">
                              <X className="h-3 w-3" />
                            </button>
                          </TagPill>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-accent hover:underline">
                        {attaching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                        Attach files
                        <input type="file" multiple className="hidden" onChange={(e) => handleReplyFiles(e.target.files)} />
                      </label>
                      <p className="text-[11px] text-text-secondary">Sent from your connected mailbox — your Gmail signature (if set) is added automatically.</p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setReplyOpen(false);
                          setReplyBody("");
                          setReplyAttachments([]);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button size="sm" onClick={sendReply} disabled={sending || attaching || !replyBody.trim()}>
                        {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Send
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <NewMessageModal
        open={composeOpen}
        onOpenChange={(o) => {
          setComposeOpen(o);
          if (!o) setForwardFrom(null);
        }}
        onSent={load}
        forwardFrom={forwardFrom}
      />
    </div>
  );
}
