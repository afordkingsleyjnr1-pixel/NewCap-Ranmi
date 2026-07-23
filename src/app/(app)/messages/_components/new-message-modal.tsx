"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface FirmOption {
  id: string;
  name: string;
}

export function NewMessageModal({ open, onOpenChange, onSent }: { open: boolean; onOpenChange: (o: boolean) => void; onSent: () => void }) {
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [firmId, setFirmId] = useState("");
  const [firmContacts, setFirmContacts] = useState<Array<{ id: string; name: string; email: string | null }>>([]);
  const [contactId, setContactId] = useState("");
  const [toName, setToName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetch("/api/firms")
        .then((r) => r.json())
        .then((d) => setFirms((d.firms ?? []).map((f: any) => ({ id: f.id, name: f.name }))))
        .catch(() => setFirms([]));
    } else {
      setFirmId("");
      setFirmContacts([]);
      setContactId("");
      setToName("");
      setToEmail("");
      setSubject("");
      setMessage("");
      setError(null);
    }
  }, [open]);

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

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        body: JSON.stringify({
          firmId: firmId || undefined,
          contactId: contactId || undefined,
          toName: contactId ? undefined : toName,
          toEmail: contactId ? undefined : toEmail,
          subject,
          message,
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
    <Modal open={open} onOpenChange={onOpenChange} title="New Message" description="Sends straight from your inbox — no CRM stage or task is affected." widthClassName="max-w-lg">
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
            <Label>Recipient</Label>
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
            <Input placeholder="Recipient email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} />
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
        {error && <p className="text-xs text-status-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Send
          </Button>
        </div>
      </div>
    </Modal>
  );
}
