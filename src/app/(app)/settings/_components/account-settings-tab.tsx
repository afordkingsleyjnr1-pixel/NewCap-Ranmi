"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { AumInput } from "@/components/ui/aum-input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export function AccountSettingsTab() {
  const [mandate, setMandate] = useState<{ aumMin: string; aumMax: string } | null>(null);
  const [appSettings, setAppSettings] = useState<any>(null);
  const [hunterKey, setHunterKey] = useState("");
  const [savingMandate, setSavingMandate] = useState(false);
  const [savingApp, setSavingApp] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [reclassifyResult, setReclassifyResult] = useState<string | null>(null);
  const [appSaveError, setAppSaveError] = useState<string | null>(null);
  const [appSaveSuccess, setAppSaveSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/settings/mandate").then((r) => r.json()).then((d) => setMandate({ aumMin: d.settings.aumMin, aumMax: d.settings.aumMax }));
    fetch("/api/settings/app").then((r) => r.json()).then(setAppSettings);
  }, []);

  async function saveMandate() {
    if (!mandate) return;
    setSavingMandate(true);
    await fetch("/api/settings/mandate", { method: "PATCH", body: JSON.stringify({ aumMin: Number(mandate.aumMin), aumMax: Number(mandate.aumMax) }) });
    setSavingMandate(false);
  }

  async function saveApp() {
    setSavingApp(true);
    setAppSaveError(null);
    setAppSaveSuccess(false);
    try {
      const res = await fetch("/api/settings/app", {
        method: "PATCH",
        body: JSON.stringify({ followUpThresholdDays: appSettings.followUpThresholdDays, hunterApiKey: hunterKey || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAppSaveError(data.error || `Save failed (HTTP ${res.status}).`);
        return;
      }
      setHunterKey("");
      const refreshed = await fetch("/api/settings/app").then((r) => r.json());
      setAppSettings(refreshed);
      setAppSaveSuccess(true);
    } catch (e) {
      setAppSaveError(e instanceof Error ? e.message : "Save failed — check your connection and try again.");
    } finally {
      setSavingApp(false);
    }
  }

  async function reclassifyAll() {
    setReclassifying(true);
    setReclassifyResult(null);
    const res = await fetch("/api/settings/reclassify-all", { method: "POST" });
    const data = await res.json();
    setReclassifyResult(res.ok ? `${data.changed} of ${data.totalFirms} firms updated.` : data.error);
    setReclassifying(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Integration Status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {appSettings &&
            Object.entries(appSettings.integrations).map(([k, v]) => (
              <Pill key={k} color={v ? "green" : "gray"}>
                {k}: {v ? "configured" : "not configured"}
              </Pill>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mandate AUM Band</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {mandate && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Min</Label>
                  <AumInput value={mandate.aumMin} onChange={(v) => setMandate({ ...mandate, aumMin: v })} />
                </div>
                <div>
                  <Label>Max</Label>
                  <AumInput value={mandate.aumMax} onChange={(v) => setMandate({ ...mandate, aumMax: v })} />
                </div>
              </div>
              <p className="text-xs text-text-secondary">Editing this immediately recomputes Within Mandate for every existing firm.</p>
              <Button size="sm" onClick={saveMandate} disabled={savingMandate}>
                {savingMandate && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hunter.io & Follow-Up Threshold</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {appSettings && (
            <>
              <div>
                <Label>Hunter.io API Key {appSettings.hunterKeyConfigured && <span className="text-status-green">(configured)</span>}</Label>
                <Input type="password" placeholder="••••••••••••" value={hunterKey} onChange={(e) => setHunterKey(e.target.value)} />
              </div>
              <div>
                <Label>Follow-up threshold (business days)</Label>
                <Input
                  type="number"
                  value={appSettings.followUpThresholdDays}
                  onChange={(e) => setAppSettings({ ...appSettings, followUpThresholdDays: Number(e.target.value) })}
                />
              </div>
              <Button size="sm" onClick={saveApp} disabled={savingApp}>
                {savingApp && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
              </Button>
              {appSaveError && <p className="text-xs text-status-red">{appSaveError}</p>}
              {appSaveSuccess && <p className="text-xs text-status-green">Saved.</p>}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reclassify All</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-text-secondary">Batch re-runs the Classification Engine across every firm in the database.</p>
          <Button size="sm" variant="outline" onClick={reclassifyAll} disabled={reclassifying}>
            {reclassifying && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {reclassifying ? "Reclassifying…" : "Reclassify All"}
          </Button>
          {reclassifyResult && <p className="text-xs text-text-primary">{reclassifyResult}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
