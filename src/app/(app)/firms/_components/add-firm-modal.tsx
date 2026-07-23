"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea, Input, Label } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { TaxonomyPicker } from "./taxonomy-picker";
import { STRATEGIES_TAXONOMY, FOCUS_AREAS_TAXONOMY } from "@/lib/taxonomy";
import { readNdjsonStream } from "@/lib/ndjson-client";

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

export function AddFirmModal({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [mode, setMode] = useState<Mode>("by_name");

  // By Name
  const [names, setNames] = useState("");
  const [nameResult, setNameResult] = useState<AddFirmSummary | null>(null);

  // By Criteria
  const [strategies, setStrategies] = useState<Record<string, string[]>>({});
  const [focusAreas, setFocusAreas] = useState<Record<string, string[]>>({});
  const [market, setMarket] = useState("");
  const [aumMin, setAumMin] = useState("");
  const [aumMax, setAumMax] = useState("");
  const [criteriaResult, setCriteriaResult] = useState<CriteriaResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [progressLog]);

  const hasCriteria = Object.keys(strategies).length > 0 || Object.keys(focusAreas).length > 0 || market.trim().length > 0 || aumMin || aumMax;

  async function submitByName() {
    setLoading(true);
    setError(null);
    setProgressLog([]);
    try {
      const res = await fetch("/api/firms", { method: "POST", body: JSON.stringify({ names }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add firms");
      }
      const data = await readNdjsonStream<AddFirmSummary>(res, (event) => {
        if (typeof event.message === "string") setProgressLog((prev) => [...prev, event.message as string]);
      });
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
    setProgressLog([]);
    try {
      const res = await fetch("/api/populate", {
        method: "POST",
        body: JSON.stringify({
          mode: "by_criteria",
          criteria: {
            strategies,
            focusAreas,
            geography: market || null,
            aumBand: aumMin || aumMax ? { min: Number(aumMin) || undefined, max: Number(aumMax) || undefined } : null,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Search failed");
      }
      const data = await readNdjsonStream<CriteriaResult>(res, (event) => {
        if (typeof event.message === "string") setProgressLog((prev) => [...prev, event.message as string]);
      });
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
    setStrategies({});
    setFocusAreas({});
    setMarket("");
    setAumMin("");
    setAumMax("");
    setNameResult(null);
    setCriteriaResult(null);
    setError(null);
    setProgressLog([]);
    onOpenChange(false);
  }

  const showingResult = nameResult || criteriaResult;

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Add Firm"
      description={
        mode === "by_name"
          ? "Type one or more firm names — the platform researches everything else."
          : "Describe the kind of manager you're looking for — the platform searches for and adds matches."
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
              By Strategy & Focus Area
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
                One name per line, or comma-separated for a batch. The platform resolves the domain, researches AUM, runs
                the Classification Engine, and finds contacts + emails automatically.
              </p>
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Strategies</Label>
                <TaxonomyPicker taxonomy={STRATEGIES_TAXONOMY} selection={strategies} onChange={setStrategies} />
              </div>
              <div>
                <Label>Focus Areas</Label>
                <TaxonomyPicker taxonomy={FOCUS_AREAS_TAXONOMY} selection={focusAreas} onChange={setFocusAreas} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <Label>Market</Label>
                  <Input value={market} onChange={(e) => setMarket(e.target.value)} placeholder="Southeast US" />
                </div>
                <div>
                  <Label>AUM min (USD)</Label>
                  <Input value={aumMin} onChange={(e) => setAumMin(e.target.value)} placeholder="1000000000" />
                </div>
                <div>
                  <Label>AUM max (USD)</Label>
                  <Input value={aumMax} onChange={(e) => setAumMax(e.target.value)} placeholder="15000000000" />
                </div>
              </div>
              <p className="text-xs text-text-secondary">
                The platform searches for managers matching this brief, skips anything already in the database, and runs
                the full research pipeline (classification, AUM, contacts, email) on every new match.
              </p>
            </div>
          )}

          {loading && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-page p-2.5 font-mono text-[11px] text-text-secondary">
              {progressLog.length === 0 && <p className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Starting…</p>}
              {progressLog.map((line, i) => (
                <p key={i} className={i === progressLog.length - 1 ? "text-text-primary" : undefined}>
                  {i === progressLog.length - 1 && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                  {line}
                </p>
              ))}
              <div ref={logEndRef} />
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
              <Button onClick={submitByCriteria} disabled={loading || !hasCriteria}>
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
              <Pill color="green">{criteriaResult.firmsAdded} new firms added</Pill>
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
