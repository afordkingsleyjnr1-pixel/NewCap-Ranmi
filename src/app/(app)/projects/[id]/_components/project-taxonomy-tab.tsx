"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Sparkles, Save } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { ProjectAddFirmModal } from "./project-add-firm-modal";

type Taxonomy = Record<string, string[]>;

export function ProjectTaxonomyTab({
  projectId,
  initialTaxonomy,
  initialDescription,
  confirmedAt,
  onSaved,
}: {
  projectId: string;
  initialTaxonomy: Taxonomy | null;
  initialDescription: string | null;
  confirmedAt: string | null;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(initialDescription ?? "");
  const [refinement, setRefinement] = useState("");
  const [draft, setDraft] = useState<Taxonomy | null>(initialTaxonomy);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addFirmOpen, setAddFirmOpen] = useState(false);

  useEffect(() => {
    setDraft(initialTaxonomy);
    setDescription(initialDescription ?? "");
  }, [initialTaxonomy, initialDescription]);

  async function generate(isRegeneration: boolean) {
    if (!description.trim()) {
      setError("Describe this project's focus first.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/taxonomy`, {
        method: "POST",
        body: JSON.stringify({ description, refinement: isRegeneration ? refinement : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to generate taxonomy");
      if (!data.taxonomy) throw new Error("The server returned an unexpected response — please try again.");
      setDraft(data.taxonomy);
      setRefinement("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/taxonomy`, {
        method: "PATCH",
        body: JSON.stringify({ taxonomy: draft, description }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save taxonomy");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  function addParent() {
    setDraft((prev) => ({ ...(prev ?? {}), "New Category": [] }));
  }

  function removeParent(parent: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next[parent];
      return next;
    });
  }

  function renameParent(oldName: string, newName: string) {
    if (!newName.trim() || newName === oldName) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const next: Taxonomy = {};
      for (const [k, v] of Object.entries(prev)) next[k === oldName ? newName : k] = v;
      return next;
    });
  }

  function addChild(parent: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, [parent]: [...prev[parent], "New Subcategory"] };
    });
  }

  function renameChild(parent: string, index: number, value: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const children = [...prev[parent]];
      children[index] = value;
      return { ...prev, [parent]: children };
    });
  }

  function removeChild(parent: string, index: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, [parent]: prev[parent].filter((_, i) => i !== index) };
    });
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          Add firms to this project using its own taxonomy, separate from the main Firm Database's Add Firm flow.
        </p>
        <Button
          size="sm"
          onClick={() => setAddFirmOpen(true)}
          disabled={!confirmedAt || !initialTaxonomy}
          title={!confirmedAt ? "Confirm & save a taxonomy below first" : undefined}
        >
          <Plus className="h-3.5 w-3.5" /> Add Firm
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="mb-2 text-sm font-medium text-text-primary">Project Focus Description</p>
        <p className="mb-2 text-xs text-text-secondary">
          Describe this project in plain language — the AI proposes a classification structure just for this project's firms. Review, edit, or
          regenerate before saving; it never touches the platform's global Strategies/Focus Areas taxonomy.
        </p>
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Sourcing emerging-manager hedge funds in Asia focused on multi-strategy and credit…" />
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" onClick={() => generate(false)} disabled={generating}>
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Generate
          </Button>
          {confirmedAt && <Pill color="green">Saved {formatDateTime(confirmedAt)}</Pill>}
        </div>
        {error && <p className="mt-2 text-xs text-status-red">{error}</p>}
      </div>

      {draft && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Object.entries(draft).map(([parent, children]) => (
              <div key={parent} className="rounded-lg border border-border bg-surface p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Input value={parent} onChange={(e) => renameParent(parent, e.target.value)} className="h-8 flex-1 font-medium" />
                  <button onClick={() => removeParent(parent)} className="rounded p-1 text-text-secondary hover:bg-page hover:text-status-red">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  {children.map((child, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input value={child} onChange={(e) => renameChild(parent, i, e.target.value)} className="h-7 flex-1 text-xs" />
                      <button onClick={() => removeChild(parent, i)} className="rounded p-0.5 text-text-secondary hover:text-status-red">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => addChild(parent)} className="flex items-center gap-1 text-xs text-accent hover:underline">
                    <Plus className="h-3 w-3" /> Add subcategory
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={addParent}>
            <Plus className="h-3.5 w-3.5" /> Add Category
          </Button>

          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-page p-3">
            <div className="flex-1">
              <p className="mb-1 text-xs text-text-secondary">Not quite right? Add notes and regenerate.</p>
              <Input value={refinement} onChange={(e) => setRefinement(e.target.value)} placeholder="e.g. add a category for fund size…" />
            </div>
            <Button size="sm" variant="outline" onClick={() => generate(true)} disabled={generating}>
              {generating && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Regenerate
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Confirm & Save
            </Button>
          </div>
        </div>
      )}

      <ProjectAddFirmModal
        open={addFirmOpen}
        onOpenChange={setAddFirmOpen}
        projectId={projectId}
        taxonomy={initialTaxonomy}
        onDone={onSaved}
      />
    </div>
  );
}
