"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

function AcceptInviteForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  useEffect(() => {
    if (!token) {
      setError("Missing invite link");
      setChecking(false);
      return;
    }
    fetch(`/api/auth/accept-invite?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setName(data.name ?? "");
          setEmail(data.email ?? "");
        }
      })
      .finally(() => setChecking(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/accept-invite", { method: "POST", body: JSON.stringify({ token, name, password }) });
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to accept invite");
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="mb-1 text-base font-semibold text-text-primary">Accept your invitation</h1>
        <p className="mb-6 text-sm text-text-secondary">Finish setting up your NewCap Ranmi account.</p>
        {checking ? (
          <p className="text-sm text-text-secondary">Checking invite…</p>
        ) : error && !email ? (
          <p className="text-sm text-status-red">{error}</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input value={email} disabled />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Password</Label>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            </div>
            <div>
              <Label>Confirm Password</Label>
              <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
            </div>
            {error && <p className="text-xs text-status-red">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !token}>
              {loading ? "Setting up…" : "Accept Invitation"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInviteForm />
    </Suspense>
  );
}
