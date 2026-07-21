"use client";

import { useEffect, useState, useCallback } from "react";
import { Input, Select } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { STAGE_LABELS, STAGE_COLORS, STAGE_ACTIONS, ACTION_LABELS } from "@/lib/crm-stages";
import { Button } from "@/components/ui/button";
import { FirmDrawer } from "../firms/_components/firm-drawer";

interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  emailStatus: string;
  firm: { id: string; name: string; crmStage: { stage: keyof typeof STAGE_LABELS } | null };
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [openFirmId, setOpenFirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    if (emailStatus) qs.set("emailStatus", emailStatus);
    const res = await fetch(`/api/contacts?${qs.toString()}`);
    const data = await res.json();
    setContacts(data.contacts ?? []);
    setLoading(false);
  }, [search, emailStatus]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Contacts</h1>
        <p className="text-sm text-text-secondary">{contacts.length} contacts across all firms</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
          <Input placeholder="Search contacts…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 pl-8" />
        </div>
        <Select value={emailStatus} onChange={(e) => setEmailStatus(e.target.value)} className="w-40">
          <option value="">All Email Status</option>
          <option value="verified">Verified</option>
          <option value="inferred">Inferred</option>
          <option value="unknown">Unknown</option>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Firm</th>
              <th>Firm CRM Stage</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-text-secondary">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && contacts.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-text-secondary">
                  No contacts yet.
                </td>
              </tr>
            )}
            {contacts.map((c) => {
              const stage = c.firm.crmStage?.stage;
              const action = stage ? STAGE_ACTIONS[stage] : null;
              return (
                <tr key={c.id} onClick={() => setOpenFirmId(c.firm.id)}>
                  <td className="font-medium text-text-primary">{c.name}</td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className="text-text-secondary">{c.email ?? "—"}</span>
                      {c.email && (
                        <Pill color={c.emailStatus === "verified" ? "green" : c.emailStatus === "inferred" ? "amber" : "gray"}>
                          {c.emailStatus}
                        </Pill>
                      )}
                    </div>
                  </td>
                  <td className="text-accent">{c.firm.name}</td>
                  <td>{stage && <Pill color={STAGE_COLORS[stage]}>{STAGE_LABELS[stage]}</Pill>}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {action && (
                      <Button size="sm" variant="outline">
                        {ACTION_LABELS[action]}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FirmDrawer firmId={openFirmId} onClose={() => setOpenFirmId(null)} onChanged={load} />
    </div>
  );
}
