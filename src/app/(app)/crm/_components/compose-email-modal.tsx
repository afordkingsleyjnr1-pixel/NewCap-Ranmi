"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { TagPill } from "@/components/ui/badge";
import { Loader2, Paperclip, X } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  rank: number;
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

export type ComposeKind = "email" | "follow_up" | "term_sheet";

const KIND_TITLES: Record<ComposeKind, string> = {
  email: "Send Email",
  follow_up: "Send Follow-Up",
  term_sheet: "Send Term Sheet / LOI",
};

export function ComposeEmailModal({
  open,
  onOpenChange,
  firmId,
  firmName,
  kind = "email",
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  firmId: string | null;
  firmName?: string;
  kind?: ComposeKind;
  onSent: () => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState("");
  const [adHocName, setAdHocName] = useState("");
  const [adHocEmail, setAdHocEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setAttachments([]);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (open && firmId) {
      fetch(`/api/firms/${firmId}`)
        .then((r) => r.json())
        .then((data) => {
          setContacts(data.firm.contacts ?? []);
          if (data.firm.contacts?.[0]) setContactId(data.firm.contacts[0].id);
          if (kind === "follow_up") {
            setSubject(`Following up — ${data.firm.name}`);
            setMessage(`Hi,\n\nFollowing up on my note below — happy to share more detail whenever useful.\n\nBest,`);
          } else if (kind === "term_sheet") {
            setSubject(`Term Sheet / LOI — ${data.firm.name}`);
            setMessage(`Hi,\n\nPlease find attached our term sheet / letter of intent for your review.\n\nBest,`);
          } else {
            setSubject(`Introduction — ${data.firm.name}`);
            setMessage(`Hi,\n\nReaching out from Adcapital Partners / NCM International regarding a potential fit with ${data.firm.name}'s platform.\n\nBest,`);
          }
        });
    }
  }, [open, firmId, kind]);

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

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        body: JSON.stringify({
          firmId,
          contactId: contactId || undefined,
          adHocName: contactId ? undefined : adHocName,
          adHocEmail: contactId ? undefined : adHocEmail,
          subject,
          message,
          kind,
          attachments: attachments.length ? attachments : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Send failed");
      onSent();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={KIND_TITLES[kind]} description={firmName} widthClassName="max-w-lg">
      <div className="space-y-3">
        <div>
          <Label>Recipient</Label>
          <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">— Type a recipient manually —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id} disabled={!c.email}>
                {c.name} {c.email ? `(${c.email})` : "(no email)"}
              </option>
            ))}
          </Select>
        </div>
        {!contactId && (
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Name" value={adHocName} onChange={(e) => setAdHocName(e.target.value)} />
            <Input placeholder="Email" value={adHocEmail} onChange={(e) => setAdHocEmail(e.target.value)} />
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
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {KIND_TITLES[kind]}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
