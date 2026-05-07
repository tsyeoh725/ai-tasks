"use client";

import { useEffect, useState } from "react";
import {
  isToday,
  isTomorrow,
  isPast,
  addDays,
  subDays,
  differenceInDays,
  isThisWeek,
  isThisMonth,
  eachDayOfInterval,
} from "date-fns";
import { formatInZone, localDayInZone } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { TaskDetailPanel } from "@/components/task-detail-panel";
import { CalendarView } from "@/components/calendar-view";
import { cn } from "@/lib/utils";
import { TASK_PRIORITY_LABELS } from "@/lib/labels";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Plus,
  Filter,
  Calendar,
  Zap,
  List,
  LayoutGrid,
  BarChart2,
  Target,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  project: { id: string; name: string; color: string } | null;
  assignee: { name: string; email: string } | null;
  subtasks: { isDone: boolean }[];
};

type ViewMode = "list" | "kanban" | "calendar" | "timeline" | "deadline" | "priority-matrix";

const VIEW_OPTIONS: { id: ViewMode; label: string; icon: React.ElementType }[] = [
  { id: "list", label: "List", icon: List },
  { id: "kanban", label: "Board", icon: LayoutGrid },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "timeline", label: "Timeline", icon: BarChart2 },
  { id: "deadline", label: "Deadlines", icon: Clock },
  { id: "priority-matrix", label: "Matrix", icon: Target },
];

const priorityDot: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-blue-400",
};

const priorityChip: Record<string, string> = {
  urgent: "bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
  high: "bg-orange-50 text-orange-600 border border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800",
  medium: "bg-yellow-50 text-yellow-600 border border-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800",
  low: "bg-gray-50 text-gray-500 border border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
};

// F-21: bucket and label dates against the canonical user tz (Asia/Kuala_Lumpur),
// not the browser's tz. Two views on different machines used to disagree on
// whether a UTC instant near a day boundary belonged to "today" vs "tomorrow".
function formatDue(dateStr: string): { label: string; urgent: boolean } {
  const localDay = localDayInZone(dateStr);
  const todayLocal = localDayInZone(new Date());
  if (isToday(localDay) || +localDay === +todayLocal) return { label: "Today", urgent: true };
  if (isTomorrow(localDay)) return { label: "Tomorrow", urgent: false };
  const label = formatInZone(dateStr, "MMM d");
  if (isPast(localDay)) return { label, urgent: true };
  return { label, urgent: false };
}

function TaskRow({
  task,
  onToggle,
  onOpenDetail,
}: {
  task: Task;
  onToggle: (id: string, status: string) => void;
  isOverdue: boolean;
  onOpenDetail?: (id: string) => void;
}) {
  const isDone = task.status === "done";
  const subtasksDone = task.subtasks.filter((s) => s.isDone).length;
  const subtasksTotal = task.subtasks.length;
  const due = task.dueDate ? formatDue(task.dueDate) : null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5 border-b border-gray-100 dark:border-white/5 group transition-colors">
      <button
        type="button"
        onClick={() => onToggle(task.id, task.status)}
        className="shrink-0 text-gray-300 hover:text-indigo-500 transition-colors"
        aria-label={isDone ? "Mark incomplete" : "Mark complete"}
      >
        {isDone ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </button>

      <button
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) {
            window.open(`/tasks/${task.id}`, "_blank");
            return;
          }
          onOpenDetail?.(task.id);
        }}
        className={cn(
          "flex-1 text-sm truncate text-left",
          isDone
            ? "line-through text-gray-400 dark:text-gray-600"
            : "text-gray-800 dark:text-gray-200 hover:text-[#2d5200] dark:hover:text-[#99ff33]"
        )}
      >
        {task.title}
        {subtasksTotal > 0 && (
          <span className="ml-2 text-[11px] text-gray-400">
            {subtasksDone}/{subtasksTotal}
          </span>
        )}
      </button>

      <div className="flex items-center gap-2 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
        {task.project && (
          <span className="hidden sm:flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 max-w-[100px] truncate">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: task.project.color }} />
            <span className="truncate">{task.project.name}</span>
          </span>
        )}
        {due && (
          <span
            className={cn(
              "flex items-center gap-1 text-[11px] shrink-0",
              due.urgent && !isDone ? "text-red-500 font-medium" : "text-gray-400"
            )}
          >
            <Clock className="h-3 w-3" />
            {due.label}
          </span>
        )}
        <span
          className={cn(
            "hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0",
            priorityChip[task.priority] || "bg-gray-50 text-gray-500 border border-gray-200"
          )}
        >
          {TASK_PRIORITY_LABELS[task.priority] || task.priority}
        </span>
      </div>
    </div>
  );
}

function SectionGroup({
  label,
  icon,
  tasks,
  onToggle,
  onOpenDetail,
  isOverdue = false,
  emptyMessage,
  defaultOpen = true,
}: {
  label: string;
  icon: React.ReactNode;
  tasks: Task[];
  onToggle: (id: string, status: string) => void;
  onOpenDetail?: (id: string) => void;
  isOverdue?: boolean;
  emptyMessage?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        )}
        <span className="text-gray-400">{icon}</span>
        {label}
        <span className="ml-1 text-gray-400 font-normal normal-case">({tasks.length})</span>
      </button>

      {open && (
        <div className="border border-gray-100 dark:border-white/8 rounded-lg overflow-hidden mx-4 bg-white dark:bg-white/3">
          {tasks.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400 text-center">
              {emptyMessage || "No tasks here."}
            </p>
          ) : (
            tasks.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={onToggle} onOpenDetail={onOpenDetail} isOverdue={isOverdue} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Kanban View ──────────────────────────────────────────────────────────────

const KANBAN_COLUMNS = [
  { id: "todo", title: "To Do", color: "bg-slate-400", headerBg: "bg-slate-50 dark:bg-slate-900/40" },
  { id: "in_progress", title: "In Progress", color: "bg-blue-500", headerBg: "bg-blue-50 dark:bg-blue-900/20" },
  { id: "done", title: "Done", color: "bg-green-500", headerBg: "bg-green-50 dark:bg-green-900/20" },
  { id: "blocked", title: "Blocked", color: "bg-red-500", headerBg: "bg-red-50 dark:bg-red-900/20" },
];

function KanbanTaskCard({ task, onToggle, onOpenDetail }: {
  task: Task;
  onToggle: (id: string, status: string) => void;
  onOpenDetail?: (id: string) => void;
}) {
  const due = task.dueDate ? formatDue(task.dueDate) : null;
  const isDone = task.status === "done";

  return (
    <div
      className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/8 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onOpenDetail?.(task.id)}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(task.id, task.status); }}
          className="mt-0.5 shrink-0 text-gray-300 hover:text-indigo-500 transition-colors"
        >
          {isDone ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
        </button>
        <p className={cn("text-sm font-medium leading-snug", isDone && "line-through text-gray-400 dark:text-gray-600", !isDone && "text-gray-800 dark:text-gray-200")}>
          {task.title}
        </p>
      </div>

      {task.project && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: task.project.color }} />
          <span className="truncate">{task.project.name}</span>
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {due && (
          <span className={cn("flex items-center gap-1 text-[11px]", due.urgent && !isDone ? "text-red-500 font-medium" : "text-gray-400")}>
            <Clock className="h-3 w-3" />
            {due.label}
          </span>
        )}
        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium", priorityChip[task.priority] || "bg-gray-50 text-gray-500 border border-gray-200")}>
          {TASK_PRIORITY_LABELS[task.priority] || task.priority}
        </span>
      </div>
    </div>
  );
}

function KanbanView({ tasks, onToggle, onOpenDetail }: {
  tasks: Task[];
  onToggle: (id: string, status: string) => void;
  onOpenDetail?: (id: string) => void;
}) {
  return (
    <div className="flex gap-4 px-4 pb-6 overflow-x-auto min-h-[400px]">
      {KANBAN_COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.id);
        return (
          <div key={col.id} className="flex-shrink-0 w-72">
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-t-lg", col.headerBg)}>
              <span className={cn("h-2.5 w-2.5 rounded-full", col.color)} />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{col.title}</span>
              <span className="ml-auto text-xs text-gray-400 bg-white/60 dark:bg-black/20 rounded-full px-1.5 py-0.5 font-medium">
                {colTasks.length}
              </span>
            </div>
            <div className="bg-gray-50 dark:bg-white/3 border border-t-0 border-gray-200 dark:border-white/8 rounded-b-lg p-2 space-y-2 min-h-[200px]">
              {colTasks.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">No tasks</p>
              )}
              {colTasks.map((task) => (
                <KanbanTaskCard key={task.id} task={task} onToggle={onToggle} onOpenDetail={onOpenDetail} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Timeline View ──────────────────────────────────────────────────────────

const PRIORITY_BAR_COLOR: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-blue-400",
};

function TimelineView({ tasks, onOpenDetail }: {
  tasks: Task[];
  onOpenDetail?: (id: string) => void;
}) {
  // F-21 / F-42: anchor today and the task pips to the user's canonical tz
  // (Asia/Kuala_Lumpur) so the pip lands on the same calendar day the user
  // sees in My Tasks. Previously the pip used browser-local startOfDay while
  // the "Today" marker did the same — but a UTC dueDate near midnight could
  // land on a different day than the user's local sense of "today",
  // appearing left of the Today line.
  const today = localDayInZone(new Date());
  const windowStart = subDays(today, 7);
  const windowEnd = addDays(today, 28);
  const totalDays = differenceInDays(windowEnd, windowStart);

  const days = eachDayOfInterval({ start: windowStart, end: windowEnd });
  const weekStarts = days.filter((d) => d.getDay() === 0 || differenceInDays(d, windowStart) === 0);

  // Group tasks by project
  const byProject = new Map<string, { name: string; color: string; tasks: Task[] }>();
  tasks.forEach((t) => {
    const key = t.project?.id ?? "__none__";
    if (!byProject.has(key)) {
      byProject.set(key, { name: t.project?.name ?? "No Project", color: t.project?.color ?? "#94a3b8", tasks: [] });
    }
    byProject.get(key)!.tasks.push(t);
  });

  function taskPosition(task: Task): { left: string; visible: boolean } {
    if (!task.dueDate) return { left: "0%", visible: false };
    const d = localDayInZone(task.dueDate);
    const offset = differenceInDays(d, windowStart);
    if (offset < 0 || offset > totalDays) return { left: "0%", visible: false };
    return { left: `${(offset / totalDays) * 100}%`, visible: true };
  }

  const todayLeft = `${(differenceInDays(today, windowStart) / totalDays) * 100}%`;

  return (
    <div className="px-4 pb-6 overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Week header */}
        <div className="relative h-8 mb-2 border-b border-gray-200 dark:border-white/10">
          {weekStarts.map((ws) => {
            const offset = differenceInDays(ws, windowStart);
            const left = `${(offset / totalDays) * 100}%`;
            return (
              <span key={ws.toISOString()} className="absolute text-[11px] text-gray-400 top-1" style={{ left }}>
                {formatInZone(ws, "MMM d")}
              </span>
            );
          })}
          {/* Today marker label */}
          <span className="absolute text-[11px] text-[#99ff33] font-semibold top-1" style={{ left: todayLeft, transform: "translateX(-50%)" }}>
            Today
          </span>
        </div>

        {/* F-41: separate the timeline rows (tasks WITH a due date) from
            the Backlog lane (tasks without one). The old layout dumped
            "No due date: <title>" as italic plain text into each project
            row, which read like a debug print. */}
        <div className="space-y-1">
          {Array.from(byProject.entries()).map(([projectId, group]) => {
            const dated = group.tasks.filter((t) => taskPosition(t).visible);
            if (dated.length === 0) return null;
            return (
              <div key={projectId}>
                <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
                  {group.name}
                </div>
                {dated.map((task) => {
                  const { left } = taskPosition(task);
                  const isDone = task.status === "done";
                  return (
                    <div key={task.id} className="relative h-8 flex items-center">
                      {/* Gridline */}
                      <div className="absolute inset-0 border-b border-gray-100 dark:border-white/5" />
                      {/* Today line */}
                      <div className="absolute top-0 bottom-0 w-px bg-[#99ff33]/40" style={{ left: todayLeft }} />
                      <button
                        type="button"
                        onClick={() => onOpenDetail?.(task.id)}
                        className={cn(
                          "absolute h-5 rounded-full px-2 text-[10px] text-white font-medium flex items-center whitespace-nowrap transition-opacity hover:opacity-80",
                          isDone ? "bg-green-400 opacity-60" : (PRIORITY_BAR_COLOR[task.priority] || "bg-slate-400"),
                          "transform -translate-x-1/2"
                        )}
                        style={{ left }}
                        title={task.title}
                      >
                        <span className="max-w-[120px] truncate">{task.title}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* F-41: Backlog lane. Tasks without a dueDate live here as dimmed
            chips grouped by project, so they're still visible (otherwise
            they'd silently disappear from this view) but can't be confused
            with scheduled work on the timeline above. */}
        {(() => {
          const backlog = tasks.filter((t) => !t.dueDate && t.status !== "done");
          if (backlog.length === 0) return null;
          const groupedBacklog = new Map<string, { name: string; color: string; tasks: Task[] }>();
          backlog.forEach((t) => {
            const key = t.project?.id ?? "__none__";
            if (!groupedBacklog.has(key)) {
              groupedBacklog.set(key, {
                name: t.project?.name ?? "No Project",
                color: t.project?.color ?? "#94a3b8",
                tasks: [],
              });
            }
            groupedBacklog.get(key)!.tasks.push(t);
          });
          return (
            <div className="mt-6 pt-4 border-t border-dashed border-gray-200 dark:border-white/10">
              <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                <Circle className="h-3 w-3 text-gray-400" />
                Backlog · no due date ({backlog.length})
              </div>
              <div className="space-y-3">
                {Array.from(groupedBacklog.entries()).map(([projectId, group]) => (
                  <div key={projectId}>
                    <div className="text-[10px] font-medium text-gray-400 mb-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: group.color }} />
                      {group.name}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.tasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => onOpenDetail?.(task.id)}
                          title={task.title}
                          className={cn(
                            "rounded-md border px-2 py-1 text-[11px] max-w-[180px] truncate text-left transition-colors",
                            "border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03]",
                            "text-gray-600 dark:text-gray-300 hover:border-[#99ff33]/40 hover:bg-[#99ff33]/5"
                          )}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_BAR_COLOR[task.priority] || "bg-slate-400")} />
                            <span className="truncate">{task.title}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Deadline View ──────────────────────────────────────────────────────────

const DEADLINE_GROUPS = [
  { key: "overdue", label: "Overdue", headerClass: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" },
  { key: "today", label: "Due Today", headerClass: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" },
  { key: "week", label: "Due This Week", headerClass: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" },
  { key: "month", label: "Due This Month", headerClass: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" },
  { key: "later", label: "Later", headerClass: "text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700" },
  { key: "none", label: "No Due Date", headerClass: "text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/20 border-gray-100 dark:border-gray-800" },
];

function getDeadlineGroup(task: Task): string {
  if (!task.dueDate) return "none";
  // F-21: bucket against the user's canonical tz day, not the browser's tz.
  const d = localDayInZone(task.dueDate);
  const todayLocal = localDayInZone(new Date());
  if (+d < +todayLocal) return "overdue";
  if (+d === +todayLocal) return "today";
  if (isThisWeek(d, { weekStartsOn: 1 })) return "week";
  if (isThisMonth(d)) return "month";
  return "later";
}

function DeadlineView({ tasks, onToggle, onOpenDetail }: {
  tasks: Task[];
  onToggle: (id: string, status: string) => void;
  onOpenDetail?: (id: string) => void;
}) {
  const grouped = DEADLINE_GROUPS.map((g) => ({
    ...g,
    tasks: tasks
      .filter((t) => t.status !== "done" && getDeadlineGroup(t) === g.key)
      .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999")),
  })).filter((g) => g.tasks.length > 0);

  const completed = tasks.filter((t) => t.status === "done");
  const [showCompleted, setShowCompleted] = useState(false);

  return (
    <div className="max-w-4xl mx-auto px-4 pb-6 space-y-4">
      {grouped.map((g) => (
        <div key={g.key}>
          <div className={cn("flex items-center gap-2 px-3 py-2 rounded-t-lg border", g.headerClass)}>
            <span className="text-sm font-semibold">{g.label}</span>
            <span className="text-xs opacity-70 font-medium">({g.tasks.length})</span>
          </div>
          <div className="border border-t-0 border-gray-100 dark:border-white/8 rounded-b-lg bg-white dark:bg-white/3 overflow-hidden">
            {g.tasks.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={onToggle} onOpenDetail={onOpenDetail} isOverdue={g.key === "overdue"} />
            ))}
          </div>
        </div>
      ))}

      {completed.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showCompleted ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            Completed ({completed.length})
          </button>
          {showCompleted && (
            <div className="mt-2 border border-gray-100 dark:border-white/8 rounded-lg overflow-hidden bg-white dark:bg-white/3">
              {completed.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={onToggle} onOpenDetail={onOpenDetail} isOverdue={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Priority Matrix View ─────────────────────────────────────────────────────

function isUrgent(task: Task): boolean {
  if (!task.dueDate) return false;
  // F-21: compare in canonical user tz day-space.
  const d = +localDayInZone(task.dueDate);
  const today = +localDayInZone(new Date());
  const threeDaysFromNow = +addDays(localDayInZone(new Date()), 3);
  return d <= today || d <= threeDaysFromNow;
}

function isImportant(task: Task): boolean {
  return task.priority === "urgent" || task.priority === "high";
}

const MATRIX_QUADRANTS = [
  {
    key: "q1",
    label: "Urgent & Important",
    sub: "Do first",
    border: "border-red-300 dark:border-red-700",
    header: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400",
    filter: (t: Task) => isUrgent(t) && isImportant(t),
  },
  {
    key: "q2",
    label: "Important, Not Urgent",
    sub: "Schedule it",
    border: "border-blue-300 dark:border-blue-700",
    header: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400",
    filter: (t: Task) => !isUrgent(t) && isImportant(t),
  },
  {
    key: "q3",
    label: "Urgent, Not Important",
    sub: "Delegate",
    border: "border-amber-300 dark:border-amber-700",
    header: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400",
    filter: (t: Task) => isUrgent(t) && !isImportant(t),
  },
  {
    key: "q4",
    label: "Neither",
    sub: "Eliminate or later",
    border: "border-gray-200 dark:border-gray-700",
    header: "bg-gray-50 dark:bg-gray-800/40 text-gray-500 dark:text-gray-400",
    filter: (t: Task) => !isUrgent(t) && !isImportant(t),
  },
];

function MatrixCard({ task, onToggle, onOpenDetail }: {
  task: Task;
  onToggle: (id: string, status: string) => void;
  onOpenDetail?: (id: string) => void;
}) {
  const due = task.dueDate ? formatDue(task.dueDate) : null;
  const isDone = task.status === "done";
  return (
    <div
      className="flex items-start gap-2 px-3 py-2 rounded-md border border-gray-100 dark:border-white/8 bg-white dark:bg-white/5 hover:shadow-sm transition-shadow cursor-pointer"
      onClick={() => onOpenDetail?.(task.id)}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle(task.id, task.status); }}
        className="mt-0.5 shrink-0 text-gray-300 hover:text-indigo-500"
      >
        {isDone ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Circle className="h-3.5 w-3.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn("text-xs font-medium truncate", isDone ? "line-through text-gray-400" : "text-gray-800 dark:text-gray-200")}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {task.project && (
            <span className="flex items-center gap-1 text-[10px] text-gray-400 truncate">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: task.project.color }} />
              <span className="truncate max-w-[80px]">{task.project.name}</span>
            </span>
          )}
          {due && (
            <span className={cn("text-[10px]", due.urgent && !isDone ? "text-red-500 font-medium" : "text-gray-400")}>
              {due.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PriorityMatrixView({ tasks, onToggle, onOpenDetail }: {
  tasks: Task[];
  onToggle: (id: string, status: string) => void;
  onOpenDetail?: (id: string) => void;
}) {
  const activeTasks = tasks.filter((t) => t.status !== "done");

  return (
    <div className="px-4 pb-6">
      <div className="grid grid-cols-2 gap-3">
        {MATRIX_QUADRANTS.map((q) => {
          const qtasks = activeTasks.filter(q.filter);
          return (
            <div key={q.key} className={cn("border-2 rounded-xl overflow-hidden", q.border)}>
              <div className={cn("px-3 py-2", q.header)}>
                <p className="text-xs font-bold">{q.label}</p>
                <p className="text-[10px] opacity-70">{q.sub}</p>
              </div>
              <div className="p-2 space-y-1.5 min-h-[150px] bg-white/50 dark:bg-black/10">
                {qtasks.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">Nothing here</p>
                )}
                {qtasks.map((task) => (
                  <MatrixCard key={task.id} task={task} onToggle={onToggle} onOpenDetail={onOpenDetail} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<Set<string>>(new Set());
  const [projectFilter, setProjectFilter] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "list";
    const saved = localStorage.getItem("tasks-view") as ViewMode | null;
    if (saved && VIEW_OPTIONS.some((v) => v.id === saved)) return saved;
    return "list";
  });
  const detailOpen = detailTaskId !== null;

  // Persist view
  useEffect(() => {
    localStorage.setItem("tasks-view", view);
  }, [view]);

  useEffect(() => {
    fetch("/api/tasks?assignedToMe=true")
      .then((r) => r.json())
      .then((data) => {
        setTasks(data.tasks || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function toggleTask(taskId: string, currentStatus: string) {
    const newStatus = currentStatus === "done" ? "todo" : "done";
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: currentStatus } : t)));
      }
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: currentStatus } : t)));
    }
  }

  async function updateTaskDate(taskId: string, newDate: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dueDate: newDate } : t)));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: newDate }),
    });
  }

  // F-21: bucket today/overdue/upcoming using the canonical user tz so a UTC
  // dueDate near midnight lands in the same bucket as it appears in other
  // views (TimelineView, DeadlineView).
  const todayLocal = localDayInZone(new Date());

  const projectOptions = Array.from(
    new Map(
      tasks.filter((t) => t.project).map((t) => [t.project!.id, t.project!])
    ).values()
  );

  const filtered = tasks.filter((t) => {
    if (priorityFilter.size > 0 && !priorityFilter.has(t.priority)) return false;
    if (projectFilter.size > 0 && (!t.project || !projectFilter.has(t.project.id))) return false;
    return true;
  });

  const dayOf = (s: string) => +localDayInZone(s);
  const overdue = filtered.filter(
    (t) => t.status !== "done" && t.dueDate && dayOf(t.dueDate) < +todayLocal
  );
  const dueToday = filtered.filter(
    (t) => t.status !== "done" && t.dueDate && dayOf(t.dueDate) === +todayLocal
  );
  const upcoming = filtered.filter(
    (t) => t.status !== "done" && (!t.dueDate || dayOf(t.dueDate) > +todayLocal)
  );
  const completed = filtered.filter((t) => t.status === "done");

  const activeFilterCount = priorityFilter.size + projectFilter.size;
  const totalActive = filtered.filter((t) => t.status !== "done").length;
  const totalCompleted = completed.length;
  const overdueCount = overdue.length;
  const urgentCount = filtered.filter((t) => t.priority === "urgent" && t.status !== "done").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-[#0a0e0a]">
      {/* Header */}
      <div className="bg-white dark:bg-[#141814] border-b border-gray-200 dark:border-white/8 px-4 md:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">My Tasks</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {totalActive} active · {totalCompleted} completed
              {overdueCount > 0 && (
                <span className="text-red-500 font-medium ml-2">· {overdueCount} overdue</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={(props) => (
                  <Button {...props} variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                    <Filter className="h-3.5 w-3.5" />
                    Filter
                    {activeFilterCount > 0 && (
                      <span className="bg-indigo-500 text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                )}
              />
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Priority</DropdownMenuLabel>
                {(["urgent", "high", "medium", "low"] as const).map((p) => (
                  <DropdownMenuCheckboxItem
                    key={p}
                    checked={priorityFilter.has(p)}
                    closeOnClick={false}
                    onClick={(e) => {
                      e.preventDefault();
                      setPriorityFilter((prev) => {
                        const next = new Set(prev);
                        if (next.has(p)) next.delete(p);
                        else next.add(p);
                        return next;
                      });
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", priorityDot[p])} />
                      {TASK_PRIORITY_LABELS[p]}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
                {projectOptions.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Project</DropdownMenuLabel>
                    {projectOptions.map((proj) => (
                      <DropdownMenuCheckboxItem
                        key={proj.id}
                        checked={projectFilter.has(proj.id)}
                        closeOnClick={false}
                        onClick={(e) => {
                          e.preventDefault();
                          setProjectFilter((prev) => {
                            const next = new Set(prev);
                            if (next.has(proj.id)) next.delete(proj.id);
                            else next.add(proj.id);
                            return next;
                          });
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: proj.color }} />
                          {proj.name}
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </>
                )}
                {activeFilterCount > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={false}
                      onClick={(e) => {
                        e.preventDefault();
                        setPriorityFilter(new Set());
                        setProjectFilter(new Set());
                      }}
                    >
                      Clear filters
                    </DropdownMenuCheckboxItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              className="h-8 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Task</span>
            </Button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="max-w-4xl mx-auto mt-3 flex gap-2 overflow-x-auto scrollbar-none">
          {[
            { label: "Active", value: totalActive, color: "text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/8", icon: <Circle className="h-3 w-3" /> },
            { label: "Overdue", value: overdueCount, color: overdueCount > 0 ? "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400" : "text-gray-400 bg-gray-50 dark:bg-white/5", icon: <AlertCircle className="h-3 w-3" /> },
            { label: "Due Today", value: dueToday.length, color: dueToday.length > 0 ? "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400" : "text-gray-400 bg-gray-50 dark:bg-white/5", icon: <Calendar className="h-3 w-3" /> },
            { label: "Urgent", value: urgentCount, color: urgentCount > 0 ? "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400" : "text-gray-400 bg-gray-50 dark:bg-white/5", icon: <Zap className="h-3 w-3" /> },
          ].map((stat) => (
            <div key={stat.label} className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium shrink-0", stat.color)}>
              {stat.icon}
              {stat.label}: <span className="font-bold">{stat.value}</span>
            </div>
          ))}
        </div>

        {/* View switcher */}
        <div className="max-w-4xl mx-auto mt-3 flex gap-1 overflow-x-auto scrollbar-none">
          {VIEW_OPTIONS.map((v) => {
            const Icon = v.icon;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium shrink-0 transition-colors",
                  view === v.id
                    ? "bg-[#99ff33]/20 text-[#2d5200] dark:text-[#99ff33] border border-[#99ff33]/40"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/8 border border-transparent"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      {view === "list" && (
        <div className="max-w-4xl mx-auto py-4">
          {overdue.length > 0 && (
            <SectionGroup
              label="Overdue"
              icon={<AlertCircle className="h-3.5 w-3.5 text-red-500 inline" />}
              tasks={overdue}
              onToggle={toggleTask}
              onOpenDetail={setDetailTaskId}
              isOverdue
              defaultOpen
            />
          )}

          {dueToday.length > 0 && (
            <SectionGroup
              label="Due Today"
              icon={<Calendar className="h-3.5 w-3.5 text-amber-500 inline" />}
              tasks={dueToday}
              onToggle={toggleTask}
              onOpenDetail={setDetailTaskId}
              defaultOpen
            />
          )}

          <SectionGroup
            label="Upcoming"
            icon={<Clock className="h-3.5 w-3.5 text-blue-400 inline" />}
            tasks={upcoming.sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))}
            onToggle={toggleTask}
            onOpenDetail={setDetailTaskId}
            emptyMessage="No upcoming tasks. You're all caught up!"
            defaultOpen
          />

          <div className="px-4 mt-2">
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showCompleted ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              Completed ({completed.length})
            </button>
            {showCompleted && (
              <div className="mt-2 border border-gray-100 dark:border-white/8 rounded-lg overflow-hidden bg-white dark:bg-white/3">
                {completed.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400 text-center">No completed tasks yet.</p>
                ) : (
                  completed
                    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""))
                    .map((task) => (
                      <TaskRow key={task.id} task={task} onToggle={toggleTask} onOpenDetail={setDetailTaskId} isOverdue={false} />
                    ))
                )}
              </div>
            )}
          </div>

          <div className="px-4 mt-6">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed border-gray-200 dark:border-white/10 text-gray-400 text-sm hover:border-indigo-300 hover:text-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-all"
            >
              <Plus className="h-4 w-4" />
              Add a new task
            </button>
          </div>
        </div>
      )}

      {view === "kanban" && (
        <div className="py-4">
          <KanbanView tasks={filtered} onToggle={toggleTask} onOpenDetail={setDetailTaskId} />
        </div>
      )}

      {view === "calendar" && (
        <div className="max-w-5xl mx-auto px-4 py-4">
          <CalendarView
            tasks={filtered}
            onTaskClick={setDetailTaskId}
            onDateChange={updateTaskDate}
          />
        </div>
      )}

      {view === "timeline" && (
        <div className="py-4">
          <TimelineView tasks={filtered} onOpenDetail={setDetailTaskId} />
        </div>
      )}

      {view === "deadline" && (
        <div className="py-4">
          <DeadlineView tasks={filtered} onToggle={toggleTask} onOpenDetail={setDetailTaskId} />
        </div>
      )}

      {view === "priority-matrix" && (
        <div className="py-4">
          <PriorityMatrixView tasks={filtered} onToggle={toggleTask} onOpenDetail={setDetailTaskId} />
        </div>
      )}

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          fetch("/api/tasks?assignedToMe=true")
            .then((r) => r.json())
            .then((data) => setTasks(data.tasks || []));
        }}
      />

      <TaskDetailPanel
        taskId={detailTaskId}
        open={detailOpen}
        onOpenChange={(o) => !o && setDetailTaskId(null)}
        onUpdate={() => {
          fetch("/api/tasks?assignedToMe=true")
            .then((r) => r.json())
            .then((data) => setTasks(data.tasks || []));
        }}
      />
    </div>
  );
}
