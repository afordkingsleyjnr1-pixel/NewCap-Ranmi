"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Users,
  KanbanSquare,
  ListChecks,
  BarChart3,
  Settings,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/firms", label: "Firms Database", icon: Building2 },
  { href: "/messages", label: "Messages", icon: Mail },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/crm", label: "CRM Pipeline", icon: KanbanSquare },
  { href: "/projects", label: "Projects", icon: ListChecks },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-white">
          NC
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight text-text-primary">NewCap Ranmi</div>
          <div className="text-[11px] leading-tight text-text-secondary">Capital Introduction</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary text-white" : "text-text-primary hover:bg-page"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-4 py-3 text-[11px] text-text-secondary">
        Adcapital Partners / NCM International
      </div>
    </aside>
  );
}
