"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

// Section: Assign Team Members — enter an email; existing users are added
// immediately, new ones get a pending account + invite link (also emailed
// from the inviter's connected mailbox when one's available).
export function AssignMemberModal({
  open,
  onOpenChange,
  projectId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  onAdded: () => void;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ invited: boolean; inviteLink: string | null } | null>(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setError(null);
      setResult(null);
    }
  }, [open]);

  async function submit() {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, { method: "POST", body: JSON.stringify({ email }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add member");
      if (data.invited) {
        setResult({ invited: true, inviteLink: data.inviteLink });
      } else {
        onAdded();
        onOpenChange(false);
      }
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Assign User" widthClassName="max-w-sm">
      {result ? (
        <div className="space-y-3">
          <p className="text-sm text-text-primary">
            No platform account existed for that email — one was created and they've been added to this project. An invite email was sent if you have a
            connected mailbox; otherwise share this link directly:
          </p>
          <div className="rounded-md bg-page px-3 py-2 text-xs text-text-primary">{result.inviteLink}</div>
          <div className="flex justify-end">
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label>Email Address</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          {error && <p className="text-xs text-status-red">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={loading || !email.trim()}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Assign
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
