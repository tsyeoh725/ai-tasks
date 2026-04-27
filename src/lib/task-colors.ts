/**
 * Shared task / project color system.
 *
 * Each stage has a distinct color chosen for quick visual parsing:
 *   status:    todo → gray, in_progress → blue, in_review → amber, done → green, blocked → red
 *   priority:  low → slate, medium → blue, high → orange, urgent → red
 *
 * Every palette returns 4 variants:
 *   - dot:    solid background for the status dot
 *   - pill:   background + text + border for badges/chips
 *   - border: left border accent for cards
 *   - text:   text-only accent
 *   - label:  human-readable label
 */

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done" | "blocked";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type ColorPalette = {
  dot: string;
  pill: string;
  border: string;
  text: string;
  label: string;
  hex: string;
};

export const STATUS_PALETTE: Record<TaskStatus, ColorPalette> = {
  todo: {
    dot: "bg-gray-300",
    pill: "bg-gray-100 text-gray-700 border-gray-200",
    border: "border-l-gray-300",
    text: "text-gray-600",
    label: "To Do",
    hex: "#9ca3af",
  },
  in_progress: {
    dot: "bg-blue-500",
    pill: "bg-blue-50 text-blue-700 border-blue-200",
    border: "border-l-blue-500",
    text: "text-blue-700",
    label: "In Progress",
    hex: "#3b82f6",
  },
  in_review: {
    dot: "bg-amber-400",
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    border: "border-l-amber-400",
    text: "text-amber-700",
    label: "In Review",
    hex: "#fbbf24",
  },
  done: {
    dot: "bg-green-500",
    pill: "bg-green-50 text-green-700 border-green-200",
    border: "border-l-green-500",
    text: "text-green-700",
    label: "Done",
    hex: "#22c55e",
  },
  blocked: {
    dot: "bg-red-500",
    pill: "bg-red-50 text-red-700 border-red-200",
    border: "border-l-red-500",
    text: "text-red-700",
    label: "Blocked",
    hex: "#ef4444",
  },
};

export const PRIORITY_PALETTE: Record<TaskPriority, ColorPalette> = {
  low: {
    dot: "bg-slate-300",
    pill: "bg-slate-50 text-slate-600 border-slate-200",
    border: "border-l-slate-300",
    text: "text-slate-600",
    label: "Low",
    hex: "#cbd5e1",
  },
  medium: {
    dot: "bg-blue-400",
    pill: "bg-blue-50 text-blue-600 border-blue-200",
    border: "border-l-blue-400",
    text: "text-blue-600",
    label: "Medium",
    hex: "#60a5fa",
  },
  high: {
    dot: "bg-orange-500",
    pill: "bg-orange-50 text-orange-700 border-orange-200",
    border: "border-l-orange-500",
    text: "text-orange-700",
    label: "High",
    hex: "#f97316",
  },
  urgent: {
    dot: "bg-red-600",
    pill: "bg-red-50 text-red-700 border-red-300 font-semibold",
    border: "border-l-red-600",
    text: "text-red-700 font-semibold",
    label: "Urgent",
    hex: "#dc2626",
  },
};

export function getStatus(status: string): ColorPalette {
  return STATUS_PALETTE[status as TaskStatus] ?? STATUS_PALETTE.todo;
}

export function getPriority(priority: string): ColorPalette {
  return PRIORITY_PALETTE[priority as TaskPriority] ?? PRIORITY_PALETTE.medium;
}

// ─── UI-ready chip components ─────────────────────────────────────────────────

export type ChipProps = {
  className?: string;
  children?: React.ReactNode;
};
