"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { StepProgress } from "@/components/ui/step-progress";
import { AumInput } from "@/components/ui/aum-input";
import { TaxonomyPicker } from "./taxonomy-picker";
import { STRATEGIES_TAXONOMY, FOCUS_AREAS_TAXONOMY } from "@/lib/taxonomy";
import { Loader2 } from "lucide-react";
import { readNdjsonStream } from "@/lib/ndjson-client";
import { ADD_FIRM_STEPS, parseAddFirmProgress } from "@/lib/progress-parse";

type Mode = "similar_to_firm" | "by_criteria" | "database_wide";

interface PopulateResult {
  firmsFound: number;
  firmsAdded: number;
  firmsSkippedDuplicate: number;
  addedFirms: { id: string; name: string }[];
  researchWarnings?: string[];
}

export function PopulateModal({
  open,
  onOpenChange,
  onDone,
  initialMode = "by_criteria",
  seedFirmId,
  seedFirmName,
  initialStrategies,
  initialFocusAreas,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
  initialMode?: Mode;
  seedFirmId?: string;
  seedFirmName?: string;
  initialStrategies?: Record<string, string[]>;
  initialFocusAreas?: Record<string, string[]>;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [strategies, setStrategies] = useState<Record<string, string[]>>(initialStrategies ?? {});
  const [focusAreas, setFocusAreas] = useState<Record<string, string[]>>(initialFocusAreas ?? {});
  const [geography, setGeography] = useState("");
  const [aumMin, setAumMin] = useState("");
  const [aumMax, setAumMax] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PopulateResult | null>(null);
  const [progressFirm, setProgressFirm] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState(0);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setStrategies(initialStrategies ?? {});
      setFocusAreas(initialFocusAreas ?? {});
      setResult(null);
      setError(null);
      setProgressFirm(null);
      setProgressStep(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleProgressEvent(event: { type: string; [k: string]: unknown }) {
    if (typeof event.message !== "string") return;
    setProgressFirm((prevFirm) => {
      const { firm, stepIndex } = parseAddFirmProgress(event.message as string, prevFirm);
      setProgressStep((prevStep) => (firm !== prevFirm ? stepIndex : Math.max(prevStep, stepIndex)));
      return firm;
    });
  }

  function clearSelection() {
    setStrategies({});
    setFocusAreas({});
    setGeography("");
    setAumMin("");
    setAumMax("");
  }

  async function submit() {
    setLoading(true);
    setError(null);
    setProgressFirm(null);
    setProgressStep(0);
    try {
      const body: Record<string, unknown> = { mode };
      if (mode === "similar_to_firm") body.seedFirmId = seedFirmId;
      if (mode === "by_criteria") {
        body.criteria = {
          strategies,
          focusAreas,
          geography: geography || null,
          aumBand: aumMin || aumMax ? { min: Number(aumMin) || undefined, max: Number(aumMax) || undefined } : null,
        };
      }
      const res = await fetch("/api/populate", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Populate failed");
      }
      const data = await readNdjsonStream<PopulateResult>(res, handleProgressEvent);
      setResult(data);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Populate — Find Similar Firms" widthClassName="max-w-2xl">
      {!result ? (
        <div className="space-y-4">
          <div className="flex gap-1 rounded-md border border-border bg-page p-1 text-xs font-medium">
            {(["similar_to_firm", "by_criteria", "database_wide"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded px-2 py-1.5 ${mode === m ? "bg-primary text-white" : "text-text-secondary hover:bg-white"}`}
              >
                {m === "similar_to_firm" ? "Similar to a Firm" : m === "by_criteria" ? "By Strategy & Focus Area" : "Across Entire Database"}
              </button>
            ))}
          </div>

          {mode === "similar_to_firm" && (
            <p className="rounded-md bg-page px-3 py-2 text-sm text-text-primary">
              Seed firm: <span className="font-medium">{seedFirmName ?? "—"}</span>
            </p>
          )}

          {mode === "by_criteria" && (
            <div className="space-y-3">
              <div>
                <Label>Strategies</Label>
                <TaxonomyPicker taxonomy={STRATEGIES_TAXONOMY} selection={strategies} onChange={setStrategies} />
              </div>
              <div>
                <Label>Focus Areas</Label>
                <TaxonomyPicker taxonomy={FOCUS_AREAS_TAXONOMY} selection={focusAreas} onChange={setFocusAreas} />
              </div>
              <div>
                <Label>Geography</Label>
                <Input value={geography} onChange={(e) => setGeography(e.target.value)} placeholder="Southeast US" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>AUM min</Label>
                  <AumInput value={aumMin} onChange={setAumMin} placeholder="1" />
                </div>
                <div>
                  <Label>AUM max</Label>
                  <AumInput value={aumMax} onChange={setAumMax} placeholder="15" />
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear Selection
              </Button>
            </div>
          )}

          {mode === "database_wide" && (
            <p className="rounded-md bg-page px-3 py-2 text-sm text-text-secondary">
              Runs comparables against your {`10 most recently added`} firms as a representative sample (capped to keep cost bounded
              regardless of database size), and adds up to 20 new firms per run.
            </p>
          )}

          {loading && (
            <div className="rounded-md border border-border bg-page px-3 py-2.5">
              <p className="mb-1 text-center text-xs font-medium text-text-primary">{progressFirm ?? "Searching for candidates…"}</p>
              <StepProgress steps={ADD_FIRM_STEPS} activeIndex={progressStep} />
            </div>
          )}

          {error && <p className="text-xs text-status-red">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={loading}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {loading ? "Searching…" : "Run Populate"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Pill color="blue">{result.firmsFound} candidates found</Pill>
            <Pill color="green">{result.firmsAdded} new firms added</Pill>
            <Pill color="gray">{result.firmsSkippedDuplicate} skipped as duplicates</Pill>
          </div>
          {result.addedFirms.length > 0 && (
            <ul className="max-h-48 overflow-y-auto text-sm text-text-primary">
              {result.addedFirms.map((f) => (
                <li key={f.id} className="border-b border-border py-1.5 last:border-0">
                  {f.name}
                </li>
              ))}
            </ul>
          )}
          {!!result.researchWarnings?.length && (
            <div className="rounded-md bg-status-amber-bg p-2.5">
              <p className="mb-1 text-xs font-medium text-status-amber">Some issues came up during research:</p>
              <ul className="text-xs text-status-amber">
                {result.researchWarnings.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
