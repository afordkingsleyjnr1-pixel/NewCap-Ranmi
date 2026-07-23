"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export function AddContactModal({
  open,
  onOpenChange,
  firmId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  firmId: string | null;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setTitle("");
      setEmail("");
      setLinkedinUrl("");
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (!firmId || !name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/firms/${firmId}/contacts`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          title: title.trim() || null,
          email: email.trim() || null,
          linkedinUrl: linkedinUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add contact");
      }
      onAdded();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add Contact" description="For a contact the research pipeline couldn't find on its own." widthClassName="max-w-md">
      <div className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" />
        </div>
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Head of Capital Markets" />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
        </div>
        <div>
          <Label>LinkedIn URL</Label>
          <Input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." />
        </div>
        {error && <p className="text-xs text-status-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading || !name.trim()}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add Contact
          </Button>
        </div>
      </div>
    </Modal>
  );
}
