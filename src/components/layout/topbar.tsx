"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/lib/utils";
import { Pill } from "@/components/ui/badge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings as SettingsIcon } from "lucide-react";

interface NotificationItem {
  id: string;
  type: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  relatedFirmId: string | null;
}

const POLL_INTERVAL_MS = 20_000;

/** Short two-tone chime via Web Audio API — no audio asset needed. */
function playChime() {
  try {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextCtor();
    const now = ctx.currentTime;
    [880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.2, now + i * 0.12 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.3);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {
    // Web Audio unsupported/blocked — silently skip the sound.
  }
}

export function Topbar({ userName = "Sydney" }: { userName?: string }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const seenIds = useRef<Set<string> | null>(null);
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function poll() {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      const next: NotificationItem[] = data.notifications ?? [];

      if (seenIds.current) {
        const fresh = next.filter((n) => !n.isRead && !seenIds.current!.has(n.id));
        if (fresh.length > 0) {
          playChime();
          if (permission === "granted") {
            for (const n of fresh.slice(0, 3)) {
              try {
                new Notification("NewCap Ranmi", { body: n.body, tag: n.id });
              } catch {
                // Notification constructor can throw in some contexts (e.g. service worker required) — ignore.
              }
            }
          }
        }
      }
      seenIds.current = new Set(next.map((n) => n.id));
      setNotifications(next);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    } else {
      setPermission("unsupported");
    }
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function requestNotificationPermission() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: "PATCH", body: JSON.stringify({ isRead: true }) });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }

  async function clearAll() {
    await fetch("/api/notifications", { method: "DELETE" });
    setNotifications([]);
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-end gap-3 border-b border-border bg-surface px-6">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="relative rounded-md p-2 text-text-secondary hover:bg-page">
            <Bell className="h-4.5 w-4.5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-red px-1 text-[10px] font-semibold text-white">
                {unreadCount}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-80 p-0">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold text-text-primary">Notifications</span>
            {notifications.length > 0 && (
              <button onClick={clearAll} className="text-[11px] text-accent hover:underline">
                Clear All
              </button>
            )}
          </div>
          {permission === "default" && (
            <button
              onClick={requestNotificationPermission}
              className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-[11px] text-accent hover:bg-page"
            >
              <BellRing className="h-3.5 w-3.5" /> Enable desktop notifications
            </button>
          )}
          {permission === "denied" && (
            <p className="border-b border-border px-3 py-2 text-[11px] text-text-secondary">
              Desktop notifications are blocked — enable them in your browser's site settings to get alerted here.
            </p>
          )}
          <div className="max-h-80 overflow-y-auto">
            {!loaded && <div className="px-3 py-4 text-xs text-text-secondary">Loading…</div>}
            {loaded && notifications.length === 0 && (
              <div className="px-3 py-4 text-xs text-text-secondary">You&apos;re all caught up.</div>
            )}
            {notifications.map((n) => (
              <Link
                key={n.id}
                href={n.relatedFirmId ? `/firms?open=${n.relatedFirmId}` : "#"}
                onClick={() => markRead(n.id)}
                className={`block border-b border-border px-3 py-2.5 text-xs last:border-0 hover:bg-page ${!n.isRead ? "bg-status-blue-bg/40" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-text-primary">{n.body}</p>
                  {!n.isRead && <Pill color="blue">New</Pill>}
                </div>
                <p className="mt-1 text-[10px] text-text-secondary">{formatDateTime(n.createdAt)}</p>
              </Link>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-page">
            <Avatar name={userName} />
            <span className="text-sm font-medium text-text-primary">{userName}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <Link href="/settings">
            <DropdownMenuItem>
              <SettingsIcon className="h-3.5 w-3.5" /> Settings
            </DropdownMenuItem>
          </Link>
          <DropdownMenuItem onClick={logout}>
            <LogOut className="h-3.5 w-3.5" /> Log Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
