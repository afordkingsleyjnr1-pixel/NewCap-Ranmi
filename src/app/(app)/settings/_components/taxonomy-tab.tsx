"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Sparkles, Save, Loader2 } from "lucide-react";

type Taxonomy = Record<string, string[]>;
type Kind = "strategy" | "focus_area";

function TaxonomyEditor({ kind, title, initialData }: { kind: Kind; title: string; initialData: Taxonomy }) {
  const [data, setData] = useState<Taxonomy>(initialData);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [newParentName, setNewParentName] = useState("");

  useEffect(() => {
    setData(initialData);
    setDirty(false);
  }, [initialData]);

  function mutate(fn: (prev: Taxonomy) => Taxonomy) {
    setData((prev) => fn(prev));
    setDirty(true);
  }

  function addParent() {
    const name = newParentName.trim();
    if (!name || data[name]) return;
    mutate((prev) => ({ ...prev, [name]: [] }));
    setNewParentName("");
  }

  function removeParent(parent: string) {
    if (!confirm(`Remove the "${parent}" category and all its subcategories?`)) return;
    mutate((prev) => {
      const next = { ...prev };
      delete next[parent];
      return next;
    });
  }

  function renameParent(oldName: string, newName: string) {
    if (!newName.trim() || newName === oldName) return;
    mutate((prev) => {
      const next: Taxonomy = {};
      for (const [k, v] of Object.entries(prev)) next[k === oldName ? newName : k] = v;
      return next;
    });
  }

  function addChild(parent: string) {
    mutate((prev) => ({ ...prev, [parent]: [...prev[parent], "New Subcategory"] }));
  }

  function renameChild(parent: string, index: number, value: string) {
    mutate((prev) => {
      const children = [...prev[parent]];
      children[index] = value;
      return { ...prev, [parent]: children };
    });
  }

  function removeChild(parent: string, index: number) {
    mutate((prev) => ({ ...prev, [parent]: prev[parent].filter((_, i) => i !== index) }));
  }

  async function generateChildren(parent: string) {
    setGeneratingFor(parent);
    setError(null);
    try {
      const res = await fetch("/api/taxonomy/generate-children", { method: "POST", body: JSON.stringify({ kind, parentName: parent }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to generate");
      mutate((prev) => ({ ...prev, [parent]: Array.from(new Set([...prev[parent], ...result.children])) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setGeneratingFor(null);
    }
  }

  async function addFundsCategory() {
    if (data["Funds"]) {
      setError('A "Funds" category already exists.');
      return;
    }
    mutate((prev) => ({ ...prev, Funds: [] }));
    await generateChildren("Funds");
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/taxonomy", { method: "PATCH", body: JSON.stringify({ kind, data }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to save");
      setDirty(false);
      setSavedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="w-full">
          <div className="flex items-center justify-between">
            <CardTitle>{title}</CardTitle>
            <div className="flex items-center gap-2">
              {kind === "strategy" && (
                <Button size="sm" variant="outline" onClick={addFundsCategory} disabled={generatingFor !== null}>
                  <Sparkles className="h-3.5 w-3.5" /> Add Funds Category
                </Button>
              )}
              <Button size="sm" onClick={save} disabled={!dirty || saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save Changes
              </Button>
            </div>
          </div>
          {savedAt && !dirty && (
            <Pill color="green" className="mt-1">
              Saved
            </Pill>
          )}
          {error && <p className="mt-1 text-xs text-status-red">{error}</p>}
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center gap-2">
          <Input
            placeholder="New category name…"
            value={newParentName}
            onChange={(e) => setNewParentName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addParent()}
            className="h-8 max-w-xs"
          />
          <Button size="sm" variant="outline" onClick={addParent} disabled={!newParentName.trim()}>
            <Plus className="h-3.5 w-3.5" /> Add Category
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Object.entries(data).map(([parent, children]) => (
            <div key={parent} className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <Input value={parent} onChange={(e) => renameParent(parent, e.target.value)} className="h-8 flex-1 font-medium" />
                <button
                  onClick={() => generateChildren(parent)}
                  disabled={generatingFor !== null}
                  title="Generate subcategories with AI"
                  className="rounded p-1.5 text-text-secondary hover:bg-page hover:text-accent"
                >
                  {generatingFor === parent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => removeParent(parent)} className="rounded p-1.5 text-text-secondary hover:bg-page hover:text-status-red">
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
          {Object.keys(data).length === 0 && <p className="text-sm text-text-secondary">No categories yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function TaxonomyTab() {
  const [strategies, setStrategies] = useState<Taxonomy | null>(null);
  const [focusAreas, setFocusAreas] = useState<Taxonomy | null>(null);

  useEffect(() => {
    fetch("/api/taxonomy")
      .then((r) => r.json())
      .then((d) => {
        setStrategies(d.strategies ?? {});
        setFocusAreas(d.focusAreas ?? {});
      });
  }, []);

  if (!strategies || !focusAreas) {
    return (
      <div className="flex items-center justify-center py-16 text-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <TaxonomyEditor kind="strategy" title="Strategies" initialData={strategies} />
      <TaxonomyEditor kind="focus_area" title="Focus Areas" initialData={focusAreas} />
    </div>
  );
}
