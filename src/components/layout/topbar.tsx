"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
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

export function Topbar({ userName = "Kweli" }: { userName?: string }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => {
        setNotifications(data.notifications ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

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
