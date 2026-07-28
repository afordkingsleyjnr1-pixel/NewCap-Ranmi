"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Pencil, FolderPlus, UserCog, Trash2, Sparkles, ExternalLink, ListChecks, NotebookPen, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserOption {
  id: string;
  name: string;
}

export interface FirmContextMenuTarget {
  x: number;
  y: number;
  firmId: string;
  firmName: string;
  domain: string | null;
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
  trailing,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  destructive?: boolean;
  trailing?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40",
        destructive ? "text-status-red hover:bg-status-red-bg" : "text-text-primary hover:bg-page"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      {trailing}
    </button>
  );
}

export function FirmContextMenu({
  target,
  onClose,
  onEdit,
  onAddToProject,
  onAssignOwner,
  onAddTask,
  onAddNote,
  onFindSimilar,
  onDelete,
}: {
  target: FirmContextMenuTarget;
  onClose: () => void;
  onEdit: () => void;
  onAddToProject: () => void;
  onAssignOwner: (userId: string) => void;
  onAddTask: () => void;
  onAddNote: () => void;
  onFindSimilar: () => void;
  onDelete: () => void;
}) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers((d.users ?? []).filter((u: any) => u.status === "active")));
  }, []);

  useEffect(() => {
    function handleClickAway(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickAway);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickAway);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Keep the menu on-screen if it's opened near the right/bottom edge.
  const style: React.CSSProperties = { top: target.y, left: target.x };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-52 rounded-md border border-border bg-surface py-1 shadow-lg"
      style={style}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem icon={Pencil} label="Edit" onClick={onEdit} />
      <MenuItem icon={FolderPlus} label="Add to Project" onClick={onAddToProject} />

      <div className="relative" onMouseEnter={() => setAssignOpen(true)} onMouseLeave={() => setAssignOpen(false)}>
        <MenuItem icon={UserCog} label="Assign" trailing={<ChevronRight className="h-3.5 w-3.5 text-text-secondary" />} />
        {assignOpen && (
          <div className="absolute left-full top-0 w-52 rounded-md border border-border bg-surface py-1 shadow-lg">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Assign Owner</p>
            {users.length === 0 && <p className="px-3 py-1 text-xs text-text-secondary">No users</p>}
            <div className="max-h-40 overflow-y-auto">
              {users.map((u) => (
                <MenuItem key={u.id} icon={UserPlus} label={u.name} onClick={() => onAssignOwner(u.id)} />
              ))}
            </div>
            <div className="my-1 border-t border-border" />
            <MenuItem icon={ListChecks} label="Add Task" onClick={onAddTask} />
            <MenuItem icon={NotebookPen} label="Add Note" onClick={onAddNote} />
          </div>
        )}
      </div>

      <MenuItem icon={Sparkles} label="Find Similar Firms" onClick={onFindSimilar} />
      {target.domain && (
        <MenuItem icon={ExternalLink} label="Visit Website" onClick={() => window.open(`https://${target.domain}`, "_blank", "noopener,noreferrer")} />
      )}
      <div className="my-1 border-t border-border" />
      <MenuItem icon={Trash2} label="Delete" destructive onClick={onDelete} />
    </div>
  );
}
