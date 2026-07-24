"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill, TagPill } from "@/components/ui/badge";
import { Textarea, Input } from "@/components/ui/input";
import { formatDateTime, formatRelativeListTime, cn } from "@/lib/utils";
import {
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Reply,
  Users,
  Forward,
  Paperclip,
  X,
  Loader2,
  Inbox as InboxIcon,
  Send as SendIcon,
  FileText,
  Trash2,
  RotateCcw,
  MailX,
  Download,
} from "lucide-react";
import { NewMessageModal, type DraftRecord } from "./_components/new-message-modal";

const PAGE_SIZE = 50;

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
  ccEmails: string[];
  attachments: Attachment[] | null;
}

interface Thread {
  id: string;
  subject: string;
  status: string;
  isFreeForm: boolean;
  lastActivityAt: string;
  hasUnreadReply: boolean;
  deletedAt: string | null;
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

type Folder = "inbox" | "sent" | "drafts" | "bin";
type View = "list" | "reader";

const FOLDERS: { key: Folder; label: string; icon: typeof InboxIcon }[] = [
  { key: "inbox", label: "Inbox", icon: InboxIcon },
  { key: "sent", label: "Sent", icon: SendIcon },
  { key: "drafts", label: "Drafts", icon: FileText },
  { key: "bin", label: "Bin", icon: Trash2 },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function MessagesPage() {
  const [folder, setFolder] = useState<Folder>("inbox");
  const [view, setView] = useState<View>("list");
  const [page, setPage] = useState(1);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<DraftRecord | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyCc, setReplyCc] = useState("");
  const [showReplyCc, setShowReplyCc] = useState(false);
  const [replyAttachments, setReplyAttachments] = useState<PendingAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [sending, setSending] = useState(false);
  const [forwardFrom, setForwardFrom] = useState<{ subject: string; body: string } | null>(null);

  const loadThreads = useCallback(async (f: Folder, showSpinner = true) => {
    if (showSpinner) setLoading(true);
    const res = await fetch(`/api/messages?folder=${f}`);
    const data = await res.json();
    setThreads(data.threads ?? []);
    if (showSpinner) setLoading(false);
  }, []);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/messages/drafts");
    const data = await res.json();
    setDrafts(data.drafts ?? []);
    setLoading(false);
  }, []);

  const load = useCallback(
    (showSpinner = true) => (folder === "drafts" ? loadDrafts() : loadThreads(folder, showSpinner)),
    [folder, loadThreads, loadDrafts]
  );

  // Switching folders always goes back to the list view, page 1.
  function selectFolder(f: Folder) {
    setFolder(f);
    setView("list");
    setPage(1);
    setOpenId(null);
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  // Replies pull in via /api/messages's sync (see reply-sync.ts) — poll in
  // the background so a reply shows up while this page is open, not just on
  // a manual refresh. Drafts/Bin don't need this.
  useEffect(() => {
    if (folder === "drafts" || folder === "bin") return;
    const interval = setInterval(() => loadThreads(folder, false), 20_000);
    return () => clearInterval(interval);
  }, [folder, loadThreads]);

  const pageCount = folder === "drafts" ? Math.max(1, Math.ceil(drafts.length / PAGE_SIZE)) : Math.max(1, Math.ceil(threads.length / PAGE_SIZE));
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const pagedThreads = useMemo(() => threads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [threads, page]);
  const pagedDrafts = useMemo(() => drafts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [drafts, page]);
  const rangeStart = (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, folder === "drafts" ? drafts.length : threads.length);

  const active = threads.find((t) => t.id === openId) ?? null;

  // Gmail-style default: only the most recent message in the thread is
  // expanded, everything before it is collapsed to a one-line summary.
  useEffect(() => {
    if (active) {
      const last = active.messages[active.messages.length - 1];
      setExpandedIds(last ? new Set([last.id]) : new Set());
      setReplyOpen(false);
      setReplyBody("");
      setReplyCc("");
      setShowReplyCc(false);
      setReplyAttachments([]);
      if (active.hasUnreadReply) {
        fetch(`/api/messages/${active.id}`, { method: "PATCH", body: JSON.stringify({ isRead: true }) })
          .then(() => setThreads((prev) => prev.map((t) => (t.id === active.id ? { ...t, hasUnreadReply: false } : t))))
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  function openThread(id: string) {
    setOpenId(id);
    setView("reader");
  }

  function backToList() {
    setView("list");
    setOpenId(null);
  }

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

  function listSenderLabel(t: Thread): string {
    return t.firm ? t.firm.name : recipientLabel(t);
  }

  function initials(label: string): string {
    const parts = label.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }

  function snippet(t: Thread): string {
    const last = t.messages[t.messages.length - 1];
    return last ? last.body.replace(/\s+/g, " ").slice(0, 140) : "";
  }

  async function markUnread(t: Thread) {
    await fetch(`/api/messages/${t.id}`, { method: "PATCH", body: JSON.stringify({ isRead: false }) });
    setThreads((prev) => prev.map((x) => (x.id === t.id ? { ...x, hasUnreadReply: true } : x)));
  }

  async function moveToBin(t: Thread) {
    await fetch(`/api/messages/${t.id}`, { method: "PATCH", body: JSON.stringify({ deletedAt: true }) });
    setThreads((prev) => prev.filter((x) => x.id !== t.id));
    backToList();
  }

  async function restoreFromBin(t: Thread) {
    await fetch(`/api/messages/${t.id}`, { method: "PATCH", body: JSON.stringify({ deletedAt: false }) });
    setThreads((prev) => prev.filter((x) => x.id !== t.id));
    backToList();
  }

  async function deleteForever(t: Thread) {
    if (!confirm(`Permanently delete "${t.subject}"? This cannot be undone.`)) return;
    await fetch(`/api/messages/${t.id}`, { method: "DELETE" });
    setThreads((prev) => prev.filter((x) => x.id !== t.id));
    backToList();
  }

  async function deleteDraft(id: string) {
    await fetch(`/api/messages/drafts/${id}`, { method: "DELETE" });
    setDrafts((prev) => prev.filter((d) => d.id !== id));
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

  function openReply(replyAll: boolean, m?: Message) {
    setReplyOpen(true);
    if (replyAll && m?.ccEmails?.length) {
      setReplyCc(m.ccEmails.join(", "));
      setShowReplyCc(true);
    } else {
      setReplyCc("");
      setShowReplyCc(false);
    }
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
          cc: showReplyCc ? replyCc.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : undefined,
          attachments: replyAttachments.length ? replyAttachments : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Send failed");
      setReplyOpen(false);
      setReplyBody("");
      setReplyCc("");
      setShowReplyCc(false);
      setReplyAttachments([]);
      loadThreads(folder, false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  function openForward(m: Message) {
    setForwardFrom({ subject: active?.subject ?? "", body: m.body });
    setEditingDraft(null);
    setComposeOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Messages</h1>
          <p className="text-sm text-text-secondary">Every email thread across every firm, plus free-form messages sent from here</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => load(true)} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-[200px_1fr] gap-4">
        {/* Left navigation — fixed */}
        <div className="space-y-1">
          <Button
            className="w-full justify-start"
            onClick={() => {
              setEditingDraft(null);
              setForwardFrom(null);
              setComposeOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Send Message
          </Button>
          <div className="pt-2">
            {FOLDERS.map((f) => {
              const Icon = f.icon;
              const unreadCount = f.key === "inbox" ? threads.filter((t) => t.hasUnreadReply).length : 0;
              return (
                <button
                  key={f.key}
                  onClick={() => selectFolder(f.key)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm",
                    folder === f.key ? "bg-primary text-white" : "text-text-primary hover:bg-page"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5" /> {f.label}
                  </span>
                  {unreadCount > 0 && folder !== f.key && <Pill color="blue">{unreadCount}</Pill>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right panel — list OR reader, never both */}
        <div className="min-h-[calc(100vh-180px)] rounded-lg border border-border bg-surface">
          {view === "reader" && active ? (
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between border-b border-border px-5 py-4">
                <div className="flex items-start gap-3">
                  <button onClick={backToList} className="mt-0.5 rounded-md p-1 text-text-secondary hover:bg-page hover:text-text-primary" title="Back">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div>
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
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {folder === "bin" ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => restoreFromBin(active)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteForever(active)}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete Forever
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => markUnread(active)} title="Mark as unread">
                        <MailX className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => moveToBin(active)}>
                        <Trash2 className="h-3.5 w-3.5" /> Move to Bin
                      </Button>
                    </>
                  )}
                </div>
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
                            {m.ccEmails?.length > 0 && <span className="text-[11px] text-text-secondary">Cc: {m.ccEmails.join(", ")}</span>}
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
                            <div className="mt-2 space-y-2">
                              <div className="flex flex-wrap gap-1.5">
                                {m.attachments.map((a, i) => (
                                  <a
                                    key={a.filename + i}
                                    href={`/api/messages/attachments/${m.id}?index=${i}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex"
                                  >
                                    <TagPill className="flex items-center gap-1 hover:bg-accent/10">
                                      <Paperclip className="h-3 w-3" /> {a.filename} <Download className="h-3 w-3" />
                                    </TagPill>
                                  </a>
                                ))}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {m.attachments
                                  .filter((a) => a.mimeType.startsWith("image/"))
                                  .map((a, i) => (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      key={a.filename + i}
                                      src={`/api/messages/attachments/${m.id}?index=${m.attachments!.indexOf(a)}`}
                                      alt={a.filename}
                                      className="h-20 w-20 rounded-md border border-border object-cover"
                                    />
                                  ))}
                              </div>
                            </div>
                          )}
                          {folder !== "bin" && (
                            <div className="mt-2 flex gap-3">
                              <button onClick={() => openReply(false)} className="flex items-center gap-1 text-xs text-accent hover:underline">
                                <Reply className="h-3 w-3" /> Reply
                              </button>
                              {m.ccEmails?.length > 0 && (
                                <button onClick={() => openReply(true, m)} className="flex items-center gap-1 text-xs text-accent hover:underline">
                                  <Users className="h-3 w-3" /> Reply All
                                </button>
                              )}
                              <button onClick={() => openForward(m)} className="flex items-center gap-1 text-xs text-accent hover:underline">
                                <Forward className="h-3 w-3" /> Forward
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {folder !== "bin" && (
                <div className="border-t border-border px-5 py-3">
                  {!replyOpen ? (
                    <Button size="sm" variant="outline" onClick={() => openReply(false)}>
                      <Reply className="h-3.5 w-3.5" /> Reply
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      {showReplyCc && <Input placeholder="Cc (comma-separated)" value={replyCc} onChange={(e) => setReplyCc(e.target.value)} />}
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
                        <div className="flex items-center gap-3">
                          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-accent hover:underline">
                            {attaching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                            Attach files
                            <input type="file" multiple className="hidden" onChange={(e) => handleReplyFiles(e.target.files)} />
                          </label>
                          {!showReplyCc && (
                            <button onClick={() => setShowReplyCc(true)} className="text-xs text-accent hover:underline">
                              Add Cc
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-text-secondary">Your Gmail signature (if set) is added automatically.</p>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setReplyOpen(false);
                            setReplyBody("");
                            setReplyCc("");
                            setShowReplyCc(false);
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
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                  {FOLDERS.find((f) => f.key === folder)?.label}
                </span>
                {(folder === "drafts" ? drafts.length : threads.length) > 0 && (
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <span>
                      {rangeStart}–{rangeEnd}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="rounded p-1 hover:bg-page disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      disabled={page >= pageCount}
                      className="rounded p-1 hover:bg-page disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading && <div className="p-4 text-sm text-text-secondary">Loading…</div>}

                {folder === "drafts" ? (
                  <>
                    {!loading && drafts.length === 0 && <div className="p-4 text-sm text-text-secondary">No drafts saved.</div>}
                    {pagedDrafts.map((d) => (
                      <div key={d.id} className="group flex items-center gap-1 border-b border-border last:border-0 hover:bg-page">
                        <button
                          onClick={() => {
                            setEditingDraft(d);
                            setForwardFrom(null);
                            setComposeOpen(true);
                          }}
                          className="flex-1 px-4 py-3 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <Pill color="gray">Draft</Pill>
                            <span className="truncate text-sm font-medium text-text-primary">{d.subject || "(no subject)"}</span>
                          </div>
                          <p className="truncate text-xs text-text-secondary">{d.toEmail || "No recipient yet"}</p>
                          <p className="truncate text-xs text-text-secondary">{d.body.replace(/\s+/g, " ").slice(0, 100)}</p>
                        </button>
                        <button
                          onClick={() => deleteDraft(d.id)}
                          className="mr-2 rounded p-1.5 text-text-secondary opacity-0 hover:bg-page hover:text-status-red group-hover:opacity-100"
                          title="Delete draft"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {!loading && threads.length === 0 && (
                      <div className="p-4 text-sm text-text-secondary">
                        {folder === "inbox" ? "No messages in your inbox." : folder === "sent" ? "Nothing sent yet." : "Bin is empty."}
                      </div>
                    )}
                    {pagedThreads.map((t) => {
                      const unread = t.hasUnreadReply;
                      return (
                        <button
                          key={t.id}
                          onClick={() => openThread(t.id)}
                          className="grid w-full grid-cols-[180px_1fr_auto] items-center gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-page"
                        >
                          <span className={cn("truncate text-sm text-text-primary", unread ? "font-bold" : "font-normal")}>{listSenderLabel(t)}</span>
                          <span className="min-w-0 truncate text-sm">
                            <span className={cn("text-text-primary", unread ? "font-bold" : "font-normal")}>{t.subject}</span>
                            <span className="text-text-secondary"> — {snippet(t)}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
                            {unread && <span className="h-2 w-2 rounded-full bg-accent" />}
                            {formatRelativeListTime(t.lastActivityAt)}
                          </span>
                        </button>
                      );
                    })}
                  </>
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
          if (!o) {
            setForwardFrom(null);
            setEditingDraft(null);
          }
        }}
        onSent={() => load(false)}
        onDraftSaved={() => (folder === "drafts" ? loadDrafts() : undefined)}
        forwardFrom={forwardFrom}
        draft={editingDraft}
      />
    </div>
  );
}
