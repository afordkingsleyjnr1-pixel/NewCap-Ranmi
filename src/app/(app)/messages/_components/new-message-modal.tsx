"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { TagPill } from "@/components/ui/badge";
import { Loader2, Paperclip, X } from "lucide-react";

interface FirmOption {
  id: string;
  name: string;
}

interface PendingAttachment {
  filename: string;
  mimeType: string;
  contentBase64: string;
}

export interface DraftRecord {
  id: string;
  firmId: string | null;
  contactId: string | null;
  replyToThreadId: string | null;
  toName: string | null;
  toEmail: string | null;
  ccEmails: string[];
  bccEmails: string[];
  subject: string;
  body: string;
  attachments: PendingAttachment[] | null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function NewMessageModal({
  open,
  onOpenChange,
  onSent,
  onDraftSaved,
  forwardFrom,
  draft,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSent: () => void;
  onDraftSaved?: () => void;
  /** Prefills the compose box for "Forward" — subject and quoted body are editable, recipient is left blank. */
  forwardFrom?: { subject: string; body: string } | null;
  /** Opens an existing saved draft for editing — Save as Draft updates it in place, Send removes it once sent. */
  draft?: DraftRecord | null;
}) {
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [firmId, setFirmId] = useState("");
  const [firmContacts, setFirmContacts] = useState<Array<{ id: string; name: string; email: string | null }>>([]);
  const [contactId, setContactId] = useState("");
  const [toName, setToName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetch("/api/firms")
        .then((r) => r.json())
        .then((d) => setFirms((d.firms ?? []).map((f: any) => ({ id: f.id, name: f.name }))))
        .catch(() => setFirms([]));
      if (draft) {
        setFirmId(draft.firmId ?? "");
        setContactId(draft.contactId ?? "");
        setToName(draft.toName ?? "");
        setToEmail(draft.toEmail ?? "");
        setCc(draft.ccEmails.join(", "));
        setBcc(draft.bccEmails.join(", "));
        setShowCcBcc(draft.ccEmails.length > 0 || draft.bccEmails.length > 0);
        setSubject(draft.subject);
        setMessage(draft.body);
        setAttachments(draft.attachments ?? []);
      } else if (forwardFrom) {
        setSubject(forwardFrom.subject.startsWith("Fwd:") ? forwardFrom.subject : `Fwd: ${forwardFrom.subject}`);
        setMessage(`\n\n---------- Forwarded message ----------\n${forwardFrom.body}`);
      }
    } else {
      setFirmId("");
      setFirmContacts([]);
      setContactId("");
      setToName("");
      setToEmail("");
      setShowCcBcc(false);
      setCc("");
      setBcc("");
      setSubject("");
      setMessage("");
      setAttachments([]);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, forwardFrom, draft?.id]);

  useEffect(() => {
    if (!firmId) {
      setFirmContacts([]);
      return;
    }
    fetch(`/api/firms/${firmId}`)
      .then((r) => r.json())
      .then((d) => setFirmContacts(d.firm?.contacts ?? []))
      .catch(() => setFirmContacts([]));
  }, [firmId]);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setAttaching(true);
    try {
      const next: PendingAttachment[] = [];
      for (const file of Array.from(files)) {
        const contentBase64 = await fileToBase64(file);
        next.push({ filename: file.name, mimeType: file.type || "application/octet-stream", contentBase64 });
      }
      setAttachments((prev) => [...prev, ...next]);
    } finally {
      setAttaching(false);
    }
  }

  function removeAttachment(filename: string) {
    setAttachments((prev) => prev.filter((a) => a.filename !== filename));
  }

  function parseAddressList(v: string): string[] {
    return v
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function draftPayload() {
    return {
      firmId: firmId || null,
      contactId: contactId || null,
      replyToThreadId: draft?.replyToThreadId ?? null,
      toName: contactId ? null : toName || null,
      toEmail: contactId ? null : toEmail || null,
      ccEmails: parseAddressList(cc),
      bccEmails: parseAddressList(bcc),
      subject,
      body: message,
      attachments: attachments.length ? attachments : undefined,
    };
  }

  async function saveDraft() {
    setSavingDraft(true);
    setError(null);
    try {
      const res = await fetch(draft ? `/api/messages/drafts/${draft.id}` : "/api/messages/drafts", {
        method: draft ? "PATCH" : "POST",
        body: JSON.stringify(draftPayload()),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save draft");
      }
      onDraftSaved?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSavingDraft(false);
    }
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      if (draft) {
        await fetch(`/api/messages/drafts/${draft.id}`, { method: "PATCH", body: JSON.stringify(draftPayload()) });
        const res = await fetch(`/api/messages/drafts/${draft.id}/send`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? data.error ?? "Send failed");
      } else {
        const res = await fetch("/api/messages/send", {
          method: "POST",
          body: JSON.stringify({
            firmId: firmId || undefined,
            contactId: contactId || undefined,
            toName: contactId ? undefined : toName,
            toEmail: contactId ? undefined : toEmail,
            cc: parseAddressList(cc),
            bcc: parseAddressList(bcc),
            subject,
            message,
            attachments: attachments.length ? attachments : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? data.error ?? "Send failed");
      }
      onSent();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={forwardFrom ? "Forward Message" : draft ? "Edit Draft" : "New Message"}
      description="Sends straight from your inbox — no CRM stage or task is affected."
      widthClassName="max-w-lg"
    >
      <div className="space-y-3">
        <div>
          <Label>Link to firm (optional)</Label>
          <Select
            value={firmId}
            onChange={(e) => {
              setFirmId(e.target.value);
              setContactId("");
            }}
          >
            <option value="">— No firm, just send a message —</option>
            {firms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </div>

        {firmId ? (
          <div>
            <Label>Recipient (To)</Label>
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">— Type a recipient manually —</option>
              {firmContacts.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.email}>
                  {c.name} {c.email ? `(${c.email})` : "(no email)"}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {!contactId && (
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Recipient name (optional)" value={toName} onChange={(e) => setToName(e.target.value)} />
            <Input placeholder="Recipient email (To)" value={toEmail} onChange={(e) => setToEmail(e.target.value)} />
          </div>
        )}

        {!showCcBcc ? (
          <button onClick={() => setShowCcBcc(true)} className="text-xs text-accent hover:underline">
            Add Cc/Bcc
          </button>
        ) : (
          <div className="space-y-2">
            <Input placeholder="Cc (comma-separated)" value={cc} onChange={(e) => setCc(e.target.value)} />
            <Input placeholder="Bcc (comma-separated)" value={bcc} onChange={(e) => setBcc(e.target.value)} />
          </div>
        )}

        <div>
          <Label>Subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <Label>Message</Label>
          <Textarea rows={8} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <TagPill key={a.filename} className="flex items-center gap-1">
                <Paperclip className="h-3 w-3" /> {a.filename}
                <button onClick={() => removeAttachment(a.filename)} className="hover:text-status-red">
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
            <input type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </label>
          <p className="text-[11px] text-text-secondary">Sent from your connected mailbox — your Gmail signature (if set) is added automatically.</p>
        </div>

        {error && <p className="text-xs text-status-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" onClick={saveDraft} disabled={savingDraft || loading}>
            {savingDraft && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save as Draft
          </Button>
          <Button onClick={submit} disabled={loading || attaching || savingDraft}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Send
          </Button>
        </div>
      </div>
    </Modal>
  );
}
