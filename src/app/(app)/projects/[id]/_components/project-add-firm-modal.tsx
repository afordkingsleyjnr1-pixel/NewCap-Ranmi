"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea, Input, Label } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { StepProgress } from "@/components/ui/step-progress";
import { AumInput } from "@/components/ui/aum-input";
import { Loader2 } from "lucide-react";
import { TaxonomyPicker } from "../../../firms/_components/taxonomy-picker";
import { readNdjsonStream } from "@/lib/ndjson-client";
import { ADD_FIRM_STEPS, parseAddFirmProgress } from "@/lib/progress-parse";

interface AddFirmSummary {
  summary: { addedCount: number; needsDomainConfirmationCount: number; skippedDuplicateCount: number };
  added: { id: string; name: string }[];
  needsDomainConfirmation: { id: string; name: string }[];
  skippedDuplicates: string[];
  researchWarnings?: string[];
  failed?: string[];
}

interface CriteriaResult {
  firmsFound: number;
  firmsAdded: number;
  firmsSkippedDuplicate: number;
  addedFirms: { id: string; name: string }[];
  researchWarnings?: string[];
}

type Mode = "by_name" | "by_criteria";

// Same two-mode flow as the main Firms Database "Add Firm" modal, but "By
// Criteria" searches against this project's own taxonomy (Settings →
// Taxonomy tab's saved structure) instead of the platform-wide Strategies/
// Focus Areas taxonomy — and every firm this adds is attached to the
// project automatically, same as the main Add Firms flow.
export function ProjectAddFirmModal({
  open,
  onOpenChange,
  projectId,
  taxonomy,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  taxonomy: Record<string, string[]> | null;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>("by_name");

  const [names, setNames] = useState("");
  const [nameResult, setNameResult] = useState<AddFirmSummary | null>(null);

  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [market, setMarket] = useState("");
  const [aumMin, setAumMin] = useState("");
  const [aumMax, setAumMax] = useState("");
  const [targetCount, setTargetCount] = useState("10");
  const [criteriaResult, setCriteriaResult] = useState<CriteriaResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressFirm, setProgressFirm] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState(0);
  const [firmsDone, setFirmsDone] = useState(0);

  const hasCriteria = Object.keys(categories).length > 0 || market.trim().length > 0 || !!aumMin || !!aumMax;
  const namesCount = names.split(/[\n,]/).map((n) => n.trim()).filter(Boolean).length;

  function handleProgressEvent(event: { type: string; [k: string]: unknown }) {
    if (typeof event.message !== "string") return;
    setProgressFirm((prevFirm) => {
      const { firm, stepIndex } = parseAddFirmProgress(event.message as string, prevFirm);
      if (firm !== prevFirm && prevFirm !== null) setFirmsDone((n) => n + 1);
      setProgressStep((prevStep) => (firm !== prevFirm ? stepIndex : Math.max(prevStep, stepIndex)));
      return firm;
    });
  }

  async function attachToProject(firmIds: string[]) {
    if (firmIds.length === 0) return;
    await fetch(`/api/projects/${projectId}/firms`, { method: "POST", body: JSON.stringify({ firmIds }) });
  }

  async function submitByName() {
    setLoading(true);
    setError(null);
    setProgressFirm(null);
    setProgressStep(0);
    setFirmsDone(0);
    try {
      const res = await fetch("/api/firms", { method: "POST", body: JSON.stringify({ names }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add firms");
      }
      const data = await readNdjsonStream<AddFirmSummary>(res, handleProgressEvent);
      await attachToProject([...data.added, ...data.needsDomainConfirmation].map((f) => f.id));
      setNameResult(data);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function submitByCriteria() {
    setLoading(true);
    setError(null);
    setProgressFirm(null);
    setProgressStep(0);
    setFirmsDone(0);
    try {
      const res = await fetch("/api/populate", {
        method: "POST",
        body: JSON.stringify({
          mode: "by_criteria",
          criteria: {
            strategies: categories,
            focusAreas: {},
            geography: market || null,
            aumBand: aumMin || aumMax ? { min: Number(aumMin) || undefined, max: Number(aumMax) || undefined } : null,
          },
          targetCount: Number(targetCount) || 10,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Search failed");
      }
      const data = await readNdjsonStream<CriteriaResult>(res, handleProgressEvent);
      await attachToProject(data.addedFirms.map((f) => f.id));
      setCriteriaResult(data);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setMode("by_name");
    setNames("");
    setCategories({});
    setMarket("");
    setAumMin("");
    setAumMax("");
    setTargetCount("10");
    setNameResult(null);
    setCriteriaResult(null);
    setError(null);
    setProgressFirm(null);
    setProgressStep(0);
    setFirmsDone(0);
    onOpenChange(false);
  }

  const showingResult = nameResult || criteriaResult;
  const hasTaxonomy = !!taxonomy && Object.keys(taxonomy).length > 0;

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Add Firm to Project"
      description={
        mode === "by_name"
          ? "Type one or more firm names — the platform researches everything else and adds them straight to this project."
          : "Describe the kind of manager you're looking for using this project's own taxonomy — matches are added straight to this project."
      }
      widthClassName="max-w-xl"
    >
      {!showingResult ? (
        <div className="space-y-4">
          <div className="flex gap-1 rounded-md border border-border bg-page p-1 text-xs font-medium">
            <button
              onClick={() => setMode("by_name")}
              className={`flex-1 rounded px-2 py-1.5 ${mode === "by_name" ? "bg-primary text-white" : "text-text-secondary hover:bg-white"}`}
            >
              By Name
            </button>
            <button
              onClick={() => setMode("by_criteria")}
              className={`flex-1 rounded px-2 py-1.5 ${mode === "by_criteria" ? "bg-primary text-white" : "text-text-secondary hover:bg-white"}`}
            >
              By Project Taxonomy
            </button>
          </div>

          {mode === "by_name" ? (
            <>
              <Textarea
                rows={6}
                placeholder={"Toorak Capital Partners\nBridge Investment Group\n..."}
                value={names}
                onChange={(e) => setNames(e.target.value)}
              />
              <p className="text-xs text-text-secondary">
                One name per line, or comma-separated for a batch. Researched the same way as the main Add Firm flow, then attached to this project.
              </p>
            </>
          ) : !hasTaxonomy ? (
            <p className="rounded-md border border-border bg-page p-3 text-xs text-text-secondary">
              This project doesn&apos;t have a saved taxonomy yet. Go to the Taxonomy tab, describe the project and generate one, then confirm it to
              use this mode.
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Project Categories</Label>
                <TaxonomyPicker taxonomy={taxonomy!} selection={categories} onChange={setCategories} />
              </div>
              <div>
                <Label>Market</Label>
                <Input value={market} onChange={(e) => setMarket(e.target.value)} placeholder="Southeast US" />
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
              <div>
                <Label>Number of firms to add</Label>
                <Input type="number" min={1} max={50} value={targetCount} onChange={(e) => setTargetCount(e.target.value)} className="w-24" />
                <p className="mt-1 text-xs text-text-secondary">How many new firms to search for and add in this run (1–50).</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="rounded-md border border-border bg-page px-3 py-2.5">
              <p className="mb-1 text-center text-xs font-medium text-text-primary">
                {progressFirm ? (
                  <>
                    {mode === "by_name" && namesCount > 1 ? `Firm ${Math.min(firmsDone + 1, namesCount)} of ${namesCount}: ` : ""}
                    {progressFirm}
                  </>
                ) : (
                  "Starting…"
                )}
              </p>
              <StepProgress steps={ADD_FIRM_STEPS} activeIndex={progressStep} />
            </div>
          )}

          {error && <p className="text-xs text-status-red">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            {mode === "by_name" ? (
              <Button onClick={submitByName} disabled={loading || names.trim().length === 0}>
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {loading ? "Researching…" : "Add & Research"}
              </Button>
            ) : (
              <Button onClick={submitByCriteria} disabled={loading || !hasCriteria || !hasTaxonomy}>
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {loading ? "Searching…" : "Search & Add"}
              </Button>
            )}
          </div>
        </div>
      ) : nameResult ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Pill color="green">{nameResult.summary.addedCount} added and fully researched</Pill>
            <Pill color="amber">{nameResult.summary.needsDomainConfirmationCount} need domain confirmation</Pill>
            <Pill color="gray">{nameResult.summary.skippedDuplicateCount} skipped as existing duplicates</Pill>
          </div>
          {nameResult.needsDomainConfirmation.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-text-secondary">Needs domain confirmation:</p>
              <ul className="text-xs text-text-primary">
                {nameResult.needsDomainConfirmation.map((f) => (
                  <li key={f.id}>{f.name}</li>
                ))}
              </ul>
            </div>
          )}
          {nameResult.skippedDuplicates.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-text-secondary">Skipped duplicates:</p>
              <ul className="text-xs text-text-primary">
                {nameResult.skippedDuplicates.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {!!nameResult.failed?.length && (
            <div className="rounded-md bg-status-red-bg p-2.5">
              <p className="mb-1 text-xs font-medium text-status-red">Failed to add:</p>
              <ul className="text-xs text-status-red">
                {nameResult.failed.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {!!nameResult.researchWarnings?.length && (
            <div className="rounded-md bg-status-amber-bg p-2.5">
              <p className="mb-1 text-xs font-medium text-status-amber">Added, but research was incomplete:</p>
              <ul className="text-xs text-status-amber">
                {nameResult.researchWarnings.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        criteriaResult && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Pill color="blue">{criteriaResult.firmsFound} candidates found</Pill>
              <Pill color="green">{criteriaResult.firmsAdded} new firms added to this project</Pill>
              <Pill color="gray">{criteriaResult.firmsSkippedDuplicate} skipped as duplicates</Pill>
            </div>
            {criteriaResult.addedFirms.length > 0 && (
              <ul className="max-h-48 overflow-y-auto text-sm text-text-primary">
                {criteriaResult.addedFirms.map((f) => (
                  <li key={f.id} className="border-b border-border py-1.5 last:border-0">
                    {f.name}
                  </li>
                ))}
              </ul>
            )}
            {!!criteriaResult.researchWarnings?.length && (
              <div className="rounded-md bg-status-amber-bg p-2.5">
                <p className="mb-1 text-xs font-medium text-status-amber">Some issues came up during research:</p>
                <ul className="text-xs text-status-amber">
                  {criteriaResult.researchWarnings.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={close}>Done</Button>
            </div>
          </div>
        )
      )}
    </Modal>
  );
}
