"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  email: string | null;
}

export function ScheduleMeetingModal({
  open,
  onOpenChange,
  firmId,
  firmName,
  onScheduled,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  firmId: string | null;
  firmName?: string;
  onScheduled: () => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState("");
  const [adHocName, setAdHocName] = useState("");
  const [adHocEmail, setAdHocEmail] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [durationMin, setDurationMin] = useState(30);
  const [locationOrLink, setLocationOrLink] = useState("");
  const [agendaNotes, setAgendaNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && firmId) {
      fetch(`/api/firms/${firmId}`)
        .then((r) => r.json())
        .then((data) => {
          setContacts(data.firm.contacts ?? []);
          if (data.firm.contacts?.[0]) setContactId(data.firm.contacts[0].id);
          setTitle(`Call — ${data.firm.name}`);
        });
    }
  }, [open, firmId]);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const start = new Date(`${date}T${startTime}:00`);
      const end = new Date(start.getTime() + durationMin * 60_000);
      const res = await fetch("/api/meetings", {
        method: "POST",
        body: JSON.stringify({
          firmId,
          contactId: contactId || undefined,
          adHocName: contactId ? undefined : adHocName,
          adHocEmail: contactId ? undefined : adHocEmail,
          title,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          locationOrLink,
          agendaNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Scheduling failed");
      onScheduled();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Schedule Meeting" description={firmName} widthClassName="max-w-lg">
      <div className="space-y-3">
        <div>
          <Label>Contact</Label>
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
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Time</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <Label>Duration (min)</Label>
            <Input type="number" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <Label>Location / Video Link</Label>
          <Input value={locationOrLink} onChange={(e) => setLocationOrLink(e.target.value)} />
        </div>
        <div>
          <Label>Agenda Notes (optional)</Label>
          <Textarea rows={3} value={agendaNotes} onChange={(e) => setAgendaNotes(e.target.value)} />
        </div>
        {error && <p className="text-xs text-status-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading || !date}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Schedule Meeting
          </Button>
        </div>
      </div>
    </Modal>
  );
}
