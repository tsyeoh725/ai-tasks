"use client";

import { cn } from "@/lib/utils";
import { getStatus, getPriority } from "@/lib/task-colors";

// ─── Status pill ──────────────────────────────────────────────────────────────

export function StatusPill({
  status,
  showDot = true,
  className,
}: {
  status: string;
  showDot?: boolean;
  className?: string;
}) {
  const p = getStatus(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border",
        p.pill,
        className,
      )}
    >
      {showDot && <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />}
      {p.label}
    </span>
  );
}

// ─── Priority pill ────────────────────────────────────────────────────────────

export function PriorityPill({
  priority,
  showDot = true,
  className,
}: {
  priority: string;
  showDot?: boolean;
  className?: string;
}) {
  const p = getPriority(priority);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] border",
        p.pill,
        className,
      )}
    >
      {showDot && <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />}
      {p.label}
    </span>
  );
}

// ─── Status / priority dot ────────────────────────────────────────────────────

export function StatusDot({ status, size = "sm", className }: { status: string; size?: "xs" | "sm" | "md"; className?: string }) {
  const p = getStatus(status);
  const dim = { xs: "h-1.5 w-1.5", sm: "h-2 w-2", md: "h-2.5 w-2.5" }[size];
  return <span className={cn("rounded-full shrink-0", p.dot, dim, className)} />;
}

export function PriorityDot({ priority, size = "sm", className }: { priority: string; size?: "xs" | "sm" | "md"; className?: string }) {
  const p = getPriority(priority);
  const dim = { xs: "h-1.5 w-1.5", sm: "h-2 w-2", md: "h-2.5 w-2.5" }[size];
  return <span className={cn("rounded-full shrink-0", p.dot, dim, className)} />;
}
