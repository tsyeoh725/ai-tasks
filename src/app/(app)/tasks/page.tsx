"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TASK_PRIORITY_LABELS } from "@/lib/labels";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  project: { name: string; color: string } | null;
  assignee: { name: string; email: string } | null;
  subtasks: { isDone: boolean }[];
};

const priorityColors: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-400",
};

function byDueDateAsc(a: Task, b: Task) {
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
}

function byCompletedAtDesc(a: Task, b: Task) {
  if (!a.completedAt && !b.completedAt) return 0;
  if (!a.completedAt) return 1;
  if (!b.completedAt) return -1;
  return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
}

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"upcoming" | "overdue" | "completed">("upcoming");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

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
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  const now = new Date();
  const inFilter = priorityFilter === "all"
    ? tasks
    : tasks.filter((t) => t.priority === priorityFilter);

  const overdueTasks = inFilter.filter(
    (t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) < now
  );
  const upcomingTasks = inFilter.filter(
    (t) => t.status !== "done" && (!t.dueDate || new Date(t.dueDate) >= now)
  );
  const completedTasks = inFilter.filter((t) => t.status === "done");

  const tabTasks = activeTab === "upcoming"
    ? [...upcomingTasks].sort(byDueDateAsc)
    : activeTab === "overdue"
      ? [...overdueTasks].sort(byDueDateAsc)
      : [...completedTasks].sort(byCompletedAtDesc);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">My Tasks</h1>
            <p className="text-muted-foreground text-sm">
              {inFilter.length} {inFilter.length === 1 ? "task" : "tasks"}
              {priorityFilter === "all" ? " assigned to you" : ` matching ${TASK_PRIORITY_LABELS[priorityFilter] ?? priorityFilter}`}
            </p>
          </div>
          <Select value={priorityFilter} onValueChange={(v) => v && setPriorityFilter(v)}>
            <SelectTrigger className="w-32 md:w-36 h-8 text-xs shrink-0">
              <SelectValue>
                {priorityFilter === "all"
                  ? "All Priorities"
                  : TASK_PRIORITY_LABELS[priorityFilter] || priorityFilter}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="urgent">{TASK_PRIORITY_LABELS.urgent}</SelectItem>
              <SelectItem value="high">{TASK_PRIORITY_LABELS.high}</SelectItem>
              <SelectItem value="medium">{TASK_PRIORITY_LABELS.medium}</SelectItem>
              <SelectItem value="low">{TASK_PRIORITY_LABELS.low}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabs — scrollable on mobile */}
        <div className="flex gap-1 border-b overflow-x-auto scrollbar-none -mx-4 md:mx-0 px-4 md:px-0">
          {([
            { key: "upcoming" as const, label: "Upcoming", count: upcomingTasks.length },
            { key: "overdue" as const, label: "Overdue", count: overdueTasks.length },
            { key: "completed" as const, label: "Completed", count: completedTasks.length },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "shrink-0 whitespace-nowrap text-sm font-medium px-3 py-2 border-b-2 transition-colors",
                activeTab === tab.key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              type="button"
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={cn(
                  "ml-1.5 text-xs rounded-full px-1.5 py-0.5",
                  tab.key === "overdue" && tab.count > 0 ? "bg-red-500/20 text-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]" : "bg-muted"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Task list */}
        {tabTasks.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">
              {activeTab === "upcoming" ? "No upcoming tasks. You're all caught up!" :
               activeTab === "overdue" ? "No overdue tasks. Great job!" :
               "No completed tasks yet."}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <ul className="md:hidden divide-y border rounded-lg overflow-hidden bg-card/30">
              {tabTasks.map((task) => {
                const isDone = task.status === "done";
                const isOverdue = task.dueDate && new Date(task.dueDate) < now && !isDone;
                const subtasksDone = task.subtasks.filter(s => s.isDone).length;
                const subtasksTotal = task.subtasks.length;
                return (
                  <li key={task.id} className="p-3 flex items-start gap-3 hover:bg-accent/40 transition-colors">
                    <label className="pt-1 flex items-center justify-center min-h-[28px] min-w-[28px]" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => toggleTask(task.id, task.status)}
                        className="h-5 w-5 rounded"
                        aria-label={isDone ? "Mark incomplete" : "Mark complete"}
                      />
                    </label>
                    <a href={`/tasks/${task.id}`} className="flex-1 min-w-0 block">
                      <p className={cn("text-sm leading-snug break-words", isDone && "line-through text-muted-foreground")}>
                        {task.title}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        {task.project && (
                          <Badge variant="outline" className="text-[10px] gap-1 py-0">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: task.project.color }} />
                            <span className="truncate max-w-[120px]">{task.project.name}</span>
                          </Badge>
                        )}
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <span className={cn("h-2 w-2 rounded-full", priorityColors[task.priority] || "bg-gray-400")} />
                          {TASK_PRIORITY_LABELS[task.priority] || task.priority}
                        </span>
                        {task.dueDate && (
                          <span className={cn("text-[11px]", isOverdue ? "text-red-500 font-medium" : "text-muted-foreground")}>
                            {format(new Date(task.dueDate), "MMM d")}
                          </span>
                        )}
                        {subtasksTotal > 0 && (
                          <span className="text-[11px] text-muted-foreground">{subtasksDone}/{subtasksTotal}</span>
                        )}
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>

            {/* Desktop table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase">
                  <th className="w-10 px-3 py-2 text-left"></th>
                  <th className="px-3 py-2 text-left font-medium">Task</th>
                  <th className="w-36 px-3 py-2 text-left font-medium">Project</th>
                  <th className="w-28 px-3 py-2 text-left font-medium">Due date</th>
                  <th className="w-20 px-3 py-2 text-left font-medium">Priority</th>
                </tr>
              </thead>
              <tbody>
                {tabTasks.map((task) => {
                  const isDone = task.status === "done";
                  const isOverdue = task.dueDate && new Date(task.dueDate) < now && !isDone;
                  const subtasksDone = task.subtasks.filter(s => s.isDone).length;
                  const subtasksTotal = task.subtasks.length;

                  return (
                    <tr key={task.id} className="border-b hover:bg-accent/50 transition-colors duration-150 group">
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isDone}
                          onChange={() => toggleTask(task.id, task.status)}
                          className="h-4 w-4 rounded"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <a href={`/tasks/${task.id}`} className={cn("hover:underline", isDone && "line-through text-muted-foreground")}>
                          {task.title}
                        </a>
                        {subtasksTotal > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">{subtasksDone}/{subtasksTotal}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {task.project ? (
                          <Badge variant="outline" className="text-xs gap-1">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: task.project.color }} />
                            <span className="truncate max-w-[80px]">{task.project.name}</span>
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {task.dueDate ? (
                          <span className={cn("text-xs", isOverdue ? "text-red-500 font-medium" : "text-muted-foreground")}>
                            {format(new Date(task.dueDate), "MMM d")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("h-2 w-2 rounded-full", priorityColors[task.priority] || "bg-gray-400")} />
                          <span className="text-xs text-muted-foreground">{TASK_PRIORITY_LABELS[task.priority] || task.priority}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
