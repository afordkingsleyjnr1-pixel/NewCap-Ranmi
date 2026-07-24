"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Modal } from "@/components/ui/drawer";
import { PERMISSIONS, PERMISSION_LABELS } from "@/lib/permissions";
import { Plus } from "lucide-react";

export function TeamRolesTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePerms, setNewRolePerms] = useState<Set<string>>(new Set());
  const [newRoleScope, setNewRoleScope] = useState<"all_firms" | "owned_firms_only">("all_firms");
  const [reassignPrompt, setReassignPrompt] = useState<{ userId: string; count: number } | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [inviteResult, setInviteResult] = useState<{ emailSent: boolean; inviteLink: string } | null>(null);
  const [resendResult, setResendResult] = useState<{ emailSent: boolean; inviteLink: string } | null>(null);

  async function load() {
    const [u, r] = await Promise.all([fetch("/api/users").then((x) => x.json()), fetch("/api/roles").then((x) => x.json())]);
    setUsers(u.users ?? []);
    setRoles(r.roles ?? []);
    if (r.roles?.[0]) setInviteRoleId(r.roles[0].id);
  }

  useEffect(() => {
    load();
  }, []);

  async function sendInvite() {
    const res = await fetch("/api/users", { method: "POST", body: JSON.stringify({ email: inviteEmail, name: inviteName, roleId: inviteRoleId }) });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Failed to send invite");
      return;
    }
    setInviteEmail("");
    setInviteName("");
    setInviteOpen(false);
    setInviteResult({ emailSent: data.emailSent, inviteLink: data.inviteLink });
    load();
  }

  async function resend(id: string) {
    const res = await fetch(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify({ action: "resend_invite" }) });
    const data = await res.json();
    setResendResult({ emailSent: data.emailSent, inviteLink: data.inviteLink });
  }
  async function revoke(id: string) {
    await fetch(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify({ action: "revoke_invite" }) });
    load();
  }

  async function deactivate(id: string) {
    const res = await fetch(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify({ action: "deactivate" }) });
    const data = await res.json();
    if (res.status === 400 && data.error === "REASSIGN_REQUIRED") {
      setReassignPrompt({ userId: id, count: data.ownedFirmsCount });
      return;
    }
    load();
  }

  async function confirmReassignAndDeactivate() {
    if (!reassignPrompt) return;
    await fetch(`/api/users/${reassignPrompt.userId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "deactivate", reassignToUserId: reassignTo }),
    });
    setReassignPrompt(null);
    setReassignTo("");
    load();
  }

  function togglePerm(p: string) {
    setNewRolePerms((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }

  async function createRole() {
    await fetch("/api/roles", {
      method: "POST",
      body: JSON.stringify({ name: newRoleName, permissions: Array.from(newRolePerms), dataScope: newRoleScope }),
    });
    setNewRoleName("");
    setNewRolePerms(new Set());
    setRoleModalOpen(false);
    load();
  }

  async function deleteRole(id: string) {
    const res = await fetch(`/api/roles/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error);
      return;
    }
    load();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Invite
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
              <div>
                <p className="font-medium text-text-primary">
                  {u.name} {u.isAccountOwner && <Pill color="blue">Owner</Pill>}
                </p>
                <p className="text-xs text-text-secondary">
                  {u.email} · {u.role.name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Pill color={u.status === "active" ? "green" : u.status === "pending_invite" ? "amber" : "gray"}>{u.status}</Pill>
                {u.status === "pending_invite" && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => resend(u.id)}>
                      Resend
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => revoke(u.id)}>
                      Revoke
                    </Button>
                  </>
                )}
                {u.status === "active" && !u.isAccountOwner && (
                  <Button size="sm" variant="ghost" onClick={() => deactivate(u.id)}>
                    Deactivate
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <Button size="sm" onClick={() => setRoleModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Create Role
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {roles.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
              <div>
                <p className="font-medium text-text-primary">
                  {r.name} {r.isSystemDefault && <Pill color="gray">System</Pill>}
                </p>
                <p className="text-xs text-text-secondary">
                  {r.dataScope} · {(r.permissions as string[]).length} permissions · {r._count.users} users
                </p>
              </div>
              {!r.isSystemDefault && (
                <Button size="sm" variant="ghost" onClick={() => deleteRole(r.id)}>
                  Delete
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Modal open={inviteOpen} onOpenChange={setInviteOpen} title="Invite Team Member">
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={inviteRoleId} onChange={(e) => setInviteRoleId(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={sendInvite}>Send Invite</Button>
          </div>
        </div>
      </Modal>

      <Modal open={roleModalOpen} onOpenChange={setRoleModalOpen} title="Create Role" widthClassName="max-w-lg">
        <div className="space-y-3">
          <div>
            <Label>Role Name</Label>
            <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} />
          </div>
          <div>
            <Label>Data Scope</Label>
            <Select value={newRoleScope} onChange={(e) => setNewRoleScope(e.target.value as any)}>
              <option value="all_firms">All Firms</option>
              <option value="owned_firms_only">Owned Firms Only</option>
            </Select>
          </div>
          <div>
            <Label>Permissions</Label>
            <div className="space-y-1.5">
              {PERMISSIONS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-xs text-text-primary">
                  <input type="checkbox" checked={newRolePerms.has(p)} onChange={() => togglePerm(p)} />
                  <span className="font-medium">{p}</span>
                  <span className="text-text-secondary">— {PERMISSION_LABELS[p]}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRoleModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createRole} disabled={!newRoleName}>
              Create Role
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!reassignPrompt} onOpenChange={(o) => !o && setReassignPrompt(null)} title="Reassign Firms Before Deactivating">
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            This person owns {reassignPrompt?.count} firm(s). Choose who inherits them before deactivating.
          </p>
          <Select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
            <option value="">— Select a user —</option>
            {users.filter((u) => u.id !== reassignPrompt?.userId && u.status === "active").map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReassignPrompt(null)}>
              Cancel
            </Button>
            <Button onClick={confirmReassignAndDeactivate} disabled={!reassignTo}>
              Reassign & Deactivate
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={!!inviteResult} onOpenChange={(o) => !o && setInviteResult(null)} title="Invite Sent">
        <div className="space-y-3">
          {inviteResult?.emailSent ? (
            <p className="text-sm text-text-primary">An invite email was sent from your connected mailbox.</p>
          ) : (
            <>
              <p className="text-sm text-status-amber">
                No email was sent — connect your mailbox in Settings → My Account so invites deliver automatically. Share this link with them
                directly in the meantime:
              </p>
              <div className="rounded-md bg-page px-3 py-2 text-xs text-text-primary break-all">
                {typeof window !== "undefined" ? window.location.origin : ""}
                {inviteResult?.inviteLink}
              </div>
            </>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setInviteResult(null)}>Done</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!resendResult} onOpenChange={(o) => !o && setResendResult(null)} title="Invite Resent">
        <div className="space-y-3">
          {resendResult?.emailSent ? (
            <p className="text-sm text-text-primary">The invite email was resent from your connected mailbox.</p>
          ) : (
            <>
              <p className="text-sm text-status-amber">
                No email was sent — connect your mailbox in Settings → My Account so invites deliver automatically. Share this link with them
                directly in the meantime:
              </p>
              <div className="rounded-md bg-page px-3 py-2 text-xs text-text-primary break-all">
                {typeof window !== "undefined" ? window.location.origin : ""}
                {resendResult?.inviteLink}
              </div>
            </>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setResendResult(null)}>Done</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
