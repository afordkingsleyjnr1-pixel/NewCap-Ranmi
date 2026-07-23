"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { TagPill } from "@/components/ui/badge";
import { Loader2, Plus, X } from "lucide-react";

export interface EditableContact {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  alternateEmails: string[];
  linkedinUrl: string | null;
}

export function EditContactModal({
  open,
  onOpenChange,
  contact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contact: EditableContact | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [alternateEmails, setAlternateEmails] = useState<string[]>([]);
  const [newAltEmail, setNewAltEmail] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && contact) {
      setName(contact.name);
      setTitle(contact.title ?? "");
      setEmail(contact.email ?? "");
      setAlternateEmails(contact.alternateEmails ?? []);
      setNewAltEmail("");
      setLinkedinUrl(contact.linkedinUrl ?? "");
      setError(null);
    }
  }, [open, contact]);

  function addAltEmail() {
    const v = newAltEmail.trim();
    if (!v || alternateEmails.includes(v)) return;
    setAlternateEmails((prev) => [...prev, v]);
    setNewAltEmail("");
  }

  function removeAltEmail(v: string) {
    setAlternateEmails((prev) => prev.filter((e) => e !== v));
  }

  async function submit() {
    if (!contact || !name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          title: title.trim() || null,
          email: email.trim() || null,
          alternateEmails,
          linkedinUrl: linkedinUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save contact");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit Contact" widthClassName="max-w-md">
      <div className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Primary Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
        </div>
        <div>
          <Label>Alternate Emails</Label>
          <p className="mb-1.5 text-xs text-text-secondary">Add another email you have or found elsewhere for this person.</p>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {alternateEmails.map((e) => (
              <TagPill key={e} className="flex items-center gap-1">
                {e}
                <button onClick={() => removeAltEmail(e)} className="hover:text-status-red">
                  <X className="h-3 w-3" />
                </button>
              </TagPill>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              type="email"
              value={newAltEmail}
              onChange={(e) => setNewAltEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAltEmail())}
              placeholder="another@company.com"
            />
            <Button size="sm" variant="outline" onClick={addAltEmail} disabled={!newAltEmail.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
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
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
