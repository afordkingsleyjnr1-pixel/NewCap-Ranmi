"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

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
    const res = await fetch("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
    if (res.ok) {
      setDone(true);
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to reset password");
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="mb-1 text-base font-semibold text-text-primary">Reset your password</h1>
        <p className="mb-6 text-sm text-text-secondary">Choose a new password for your account.</p>
        {done ? (
          <div className="space-y-3">
            <p className="text-sm text-text-primary">Your password has been reset.</p>
            <Button className="w-full" onClick={() => router.push("/login")}>
              Sign In
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>New Password</Label>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            </div>
            <div>
              <Label>Confirm New Password</Label>
              <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
            </div>
            {error && <p className="text-xs text-status-red">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !token}>
              {loading ? "Saving…" : "Reset Password"}
            </Button>
          </form>
        )}
        <p className="mt-4 text-center text-xs text-text-secondary">
          <Link href="/login" className="text-accent hover:underline">
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
