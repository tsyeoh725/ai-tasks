"use client";

import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/labels";
import {
  X,
  CheckCircle2,
  Circle,
  Calendar,
  ExternalLink,
  Plus,
  Trash2,
  Send,
} from "lucide-react";

type Subtask = { id: string; title: string; isDone: boolean };
type Comment = {
  id: string;
  content: string;
  isAi: boolean;
  createdAt: string;
  author?: { name: string } | null;
};
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  estimatedHours: number | null;
  projectId: string;
  project: { id: string; name: string; color: string };
  assignee?: { id: string; name: string; email: string } | null;
  subtasks: Subtask[];
  comments: Comment[];
};

const PRIORITY_CHIP: Record<string, string> = {
  urgent: "bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
  high: "bg-orange-50 text-orange-600 border border-orange-100 dark:bg-orange-900/20 dark:text-orange-400",
  medium: "bg-yellow-50 text-yellow-600 border border-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400",
  low: "bg-gray-50 text-gray-500 border border-gray-200 dark:bg-gray-800 dark:text-gray-400",
};

export function TaskDetailPanel({
  taskId,
  open,
  onOpenChange,
  onUpdate,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: () => void;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const fetchTask = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${id}`);
      if (res.ok) {
        const data = await res.json();
        setTask(data);
        setEditTitle(data.title);
        setEditDesc(data.description || "");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && taskId) {
      fetchTask(taskId);
    } else if (!open) {
      setTask(null);
      setEditingTitle(false);
      setEditingDesc(false);
    }
  }, [open, taskId, fetchTask]);

  async function patch(updates: Record<string, unknown>) {
    if (!task) return;
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    await fetchTask(task.id);
    onUpdate?.();
  }

  async function toggleSubtask(subtaskId: string, isDone: boolean) {
    if (!task) return;
    await fetch(`/api/subtasks/${subtaskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDone: !isDone }),
    });
    await fetchTask(task.id);
  }

  async function addSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !newSubtask.trim()) return;
    await fetch("/api/subtasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id, title: newSubtask.trim() }),
    });
    setNewSubtask("");
    await fetchTask(task.id);
  }

  async function deleteSubtask(subtaskId: string) {
    if (!task) return;
    await fetch(`/api/subtasks/${subtaskId}`, { method: "DELETE" });
    await fetchTask(task.id);
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !commentText.trim() || submittingComment) return;
    setSubmittingComment(true);
    await fetch(`/api/tasks/${task.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: commentText.trim() }),
    });
    setCommentText("");
    setSubmittingComment(false);
    await fetchTask(task.id);
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/20 dark:bg-black/40 backdrop-blur-[1px]"
        onClick={() => onOpenChange(false)}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l bg-white dark:bg-[#141814] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/8 shrink-0">
          {task && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 min-w-0">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: task.project.color }} />
              <span className="truncate">{task.project.name}</span>
            </div>
          )}
          <div className="flex items-center gap-1 ml-auto">
            {task && (
              <a
                href={`/tasks/${task.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors"
                title="Open full page"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && !task ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : task ? (
            <div className="px-4 py-4 space-y-5">
              {/* Title */}
              <div>
                {editingTitle ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (editTitle.trim()) {
                        await patch({ title: editTitle.trim() });
                      }
                      setEditingTitle(false);
                    }}
                    className="flex gap-2"
                  >
                    <Input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="text-base font-semibold"
                      onBlur={async () => {
                        if (editTitle.trim()) await patch({ title: editTitle.trim() });
                        setEditingTitle(false);
                      }}
                    />
                  </form>
                ) : (
                  <h2
                    className={cn(
                      "text-base font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors leading-snug",
                      task.status === "done" && "line-through text-gray-400 dark:text-gray-600"
                    )}
                    onClick={() => { setEditTitle(task.title); setEditingTitle(true); }}
                  >
                    {task.title}
                  </h2>
                )}
              </div>

              {/* Status & Priority row */}
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={task.status} onValueChange={(v) => patch({ status: v })}>
                  <SelectTrigger className="h-7 text-xs w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["todo", "in_progress", "done", "blocked"] as const).map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">
                        {TASK_STATUS_LABELS[s] || s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={task.priority} onValueChange={(v) => patch({ priority: v })}>
                  <SelectTrigger className={cn("h-7 text-xs w-32", PRIORITY_CHIP[task.priority])}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["urgent", "high", "medium", "low"] as const).map((p) => (
                      <SelectItem key={p} value={p} className="text-xs">
                        {TASK_PRIORITY_LABELS[p] || p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Due date */}
                <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
                  <Calendar className="h-3.5 w-3.5" />
                  <input
                    type="date"
                    className="bg-transparent text-xs outline-none cursor-pointer w-[100px]"
                    value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                    onChange={(e) => patch({ dueDate: e.target.value || null })}
                  />
                  {!task.dueDate && <span>Due date</span>}
                </label>
              </div>

              {/* Assignee */}
              {task.assignee && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <div className="h-5 w-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                    {task.assignee.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs">{task.assignee.name}</span>
                </div>
              )}

              {/* Description */}
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Description</p>
                {editingDesc ? (
                  <Textarea
                    autoFocus
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="text-sm min-h-[80px] resize-none"
                    onBlur={async () => {
                      await patch({ description: editDesc });
                      setEditingDesc(false);
                    }}
                  />
                ) : (
                  <div
                    className={cn(
                      "text-sm leading-relaxed cursor-pointer rounded-md px-2 py-1 -mx-2 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors min-h-[36px]",
                      task.description ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-600 italic"
                    )}
                    onClick={() => { setEditDesc(task.description || ""); setEditingDesc(true); }}
                  >
                    {task.description || "Add a description…"}
                  </div>
                )}
              </div>

              {/* Subtasks */}
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                  Subtasks {task.subtasks.length > 0 && `(${task.subtasks.filter(s => s.isDone).length}/${task.subtasks.length})`}
                </p>
                <div className="space-y-1">
                  {task.subtasks.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 group">
                      <button
                        type="button"
                        onClick={() => toggleSubtask(s.id, s.isDone)}
                        className="shrink-0 text-gray-300 hover:text-indigo-500 transition-colors"
                      >
                        {s.isDone
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          : <Circle className="h-3.5 w-3.5" />
                        }
                      </button>
                      <span className={cn("text-sm flex-1", s.isDone && "line-through text-gray-400 dark:text-gray-600")}>
                        {s.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteSubtask(s.id)}
                        className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <form onSubmit={addSubtask} className="mt-2 flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Add subtask…"
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    className="flex-1 text-sm bg-transparent border-b border-gray-200 dark:border-white/10 focus:border-indigo-400 dark:focus:border-indigo-500 outline-none px-0 py-1 text-gray-700 dark:text-gray-300 placeholder:text-gray-400 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!newSubtask.trim()}
                    className="text-indigo-500 hover:text-indigo-600 disabled:opacity-30 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </form>
              </div>

              {/* Comments */}
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                  Comments {task.comments.filter(c => !c.isAi).length > 0 && `(${task.comments.filter(c => !c.isAi).length})`}
                </p>
                <div className="space-y-3">
                  {task.comments.filter(c => !c.isAi).map((c) => (
                    <div key={c.id} className="flex gap-2">
                      <div className="h-6 w-6 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-[10px] font-semibold text-gray-600 dark:text-gray-400 shrink-0 mt-0.5">
                        {(c.author?.name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{c.author?.name || "Unknown"}</span>
                          <span className="text-[10px] text-gray-400">
                            {format(new Date(c.createdAt), "MMM d, h:mm a")}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words">{c.content}</p>
                      </div>
                    </div>
                  ))}
                  {task.comments.filter(c => !c.isAi).length === 0 && (
                    <p className="text-xs text-gray-400 italic">No comments yet.</p>
                  )}
                </div>
                <form onSubmit={postComment} className="mt-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="Add a comment…"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="flex-1 text-sm bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md px-3 py-1.5 outline-none focus:border-indigo-400 dark:focus:border-indigo-500 transition-colors text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!commentText.trim() || submittingComment}
                    className="h-8 w-8 p-0"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </form>
              </div>

              {/* Open full page link */}
              <div className="pt-2 border-t border-gray-100 dark:border-white/8">
                <a
                  href={`/tasks/${task.id}`}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open full task page
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
