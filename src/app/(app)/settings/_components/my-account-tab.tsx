"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { useSearchParams } from "next/navigation";

export function MyAccountTab() {
  const [connection, setConnection] = useState<any>(null);
  const searchParams = useSearchParams();

  async function load() {
    const res = await fetch("/api/email-connections");
    const data = await res.json();
    setConnection(data.connection);
  }

  useEffect(() => {
    load();
  }, [searchParams]);

  async function disconnect() {
    await fetch("/api/email-connections/disconnect", { method: "POST" });
    load();
  }

  return (
    <div className="space-y-4">
      {searchParams.get("connected") && (
        <div className="rounded-md bg-status-green-bg px-3 py-2 text-sm text-status-green">Mailbox connected successfully.</div>
      )}
      {searchParams.get("error") && (
        <div className="rounded-md bg-status-red-bg px-3 py-2 text-sm text-status-red">
          Connection failed{searchParams.get("reason") ? `: ${searchParams.get("reason")}` : ". Check your OAuth configuration."}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Connected Email Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {connection && connection.status !== "disconnected" ? (
            <>
              <div className="flex items-center gap-2">
                <Pill color={connection.status === "connected" ? "green" : "red"}>{connection.status}</Pill>
                <span className="text-sm text-text-primary">
                  {connection.provider} — {connection.connectedEmail}
                </span>
              </div>
              {connection.status === "needs_reauth" && (
                <div className="flex gap-2">
                  <a href="/api/auth/google/connect">
                    <Button size="sm" variant="outline">
                      Reconnect Gmail
                    </Button>
                  </a>
                  <a href="/api/auth/microsoft/connect">
                    <Button size="sm" variant="outline">
                      Reconnect Outlook
                    </Button>
                  </a>
                </div>
              )}
              <Button size="sm" variant="ghost" onClick={disconnect}>
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-text-secondary">No mailbox connected. Connect Gmail or Outlook to send outreach and schedule meetings.</p>
              <div className="flex gap-2">
                <a href="/api/auth/google/connect">
                  <Button size="sm">Connect Gmail</Button>
                </a>
                <a href="/api/auth/microsoft/connect">
                  <Button size="sm" variant="outline">
                    Connect Outlook
                  </Button>
                </a>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
