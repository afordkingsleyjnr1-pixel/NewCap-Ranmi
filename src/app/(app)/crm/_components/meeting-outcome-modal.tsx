"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

// Section 5 — "Meeting Scheduled": once the meeting's time has passed, the
// user picks one of three outcomes. Reschedule keeps the firm at Meeting
// Scheduled with a new time; the other two advance the pipeline.
export function MeetingOutcomeModal({
  open,
  onOpenChange,
  meetingId,
  firmName,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  meetingId: string | null;
  firmName?: string;
  onDone: () => void;
}) {
  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [durationMin, setDurationMin] = useState(30);
  const [loading, setLoading] = useState(false);

  async function setOutcome(outcome: "in_discussion" | "declined") {
    if (!meetingId) return;
    setLoading(true);
    await fetch(`/api/meetings/${meetingId}`, { method: "PATCH", body: JSON.stringify({ action: "set_outcome", outcome }) });
    setLoading(false);
    onDone();
    onOpenChange(false);
  }

  async function submitReschedule() {
    if (!meetingId || !date) return;
    setLoading(true);
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + durationMin * 60_000);
    await fetch(`/api/meetings/${meetingId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "reschedule", startTime: start.toISOString(), endTime: end.toISOString() }),
    });
    setLoading(false);
    setRescheduling(false);
    onDone();
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Meeting Outcome" description={firmName} widthClassName="max-w-sm">
      {!rescheduling ? (
        <div className="space-y-2">
          <p className="text-sm text-text-secondary">The scheduled meeting time has passed. What happened?</p>
          <Button className="w-full" onClick={() => setOutcome("in_discussion")} disabled={loading}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            In Discussion / Due Diligence
          </Button>
          <Button className="w-full" variant="outline" onClick={() => setOutcome("declined")} disabled={loading}>
            Declined
          </Button>
          <Button className="w-full" variant="ghost" onClick={() => setRescheduling(true)} disabled={loading}>
            Reschedule Meeting
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input type="number" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRescheduling(false)}>
              Back
            </Button>
            <Button onClick={submitReschedule} disabled={loading || !date}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm New Time
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
