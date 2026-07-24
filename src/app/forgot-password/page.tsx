"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="mb-1 text-base font-semibold text-text-primary">Forgot password</h1>
        <p className="mb-6 text-sm text-text-secondary">Enter your account email and we'll send you a reset link.</p>
        {sent ? (
          <p className="text-sm text-text-primary">
            If an account exists for <span className="font-medium">{email}</span>, a reset link has been sent. Check your inbox.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send Reset Link"}
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
