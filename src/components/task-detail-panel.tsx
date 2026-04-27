"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  X,
  Calendar,
  User,
  Flag,
  CircleDot,
  CheckSquare,
  ExternalLink,
  Loader2,
  Trash2,
  Plus,
  MessageCircle,
  Clock,
  Pencil,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { StatusPill, PriorityPill } from "@/components/task-chips";
import { TaskAttachments } from "@/components/task-attachments";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeId: string | null;
  projectId: string;
  clientId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  project?: { id: string; name: string; color: string } | null;
  client?: { id: string; name: string } | null;
  assignee?: { id: string; name: string; email: string } | null;
  subtasks?: { id: string; title: string; isDone: boolean }[];
  comments?: {
    id: string;
    content: string;
    isAi: boolean;
    createdAt: string;
    author?: { id: string; name: string } | null;
  }[];
};

const STATUS_OPTIONS = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Blocked" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function TaskDetailPanel({
  taskId,
  open,
  onOpenChange,
  onUpdate,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUpdate?: () => void;
}) {
  const { success, error } = useToast();
  const confirm = useConfirm();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);

  const fetchTask = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (res.ok) {
        const t = await res.json();
        setTask(t);
        setTitleDraft(t.title);
        setDescDraft(t.description ?? "");
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [taskId]);

  useEffect(() => { if (open && taskId) fetchTask(); }, [open, taskId, fetchTask]);

  // Keyboard: Esc to close (Sheet handles this) + Cmd+Enter to save comment
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (newComment.trim()) postComment();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, newComment]);

  async function patch(updates: Record<string, unknown>) {
    if (!task) return;
    // Optimistic
    setTask((t) => (t ? { ...t, ...updates } : t));
    onUpdate?.();
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) { error({ title: "Save failed" }); fetchTask(); }
  }

  async function saveTitle() {
    if (!task || !titleDraft.trim() || titleDraft === task.title) {
      setEditingTitle(false);
      return;
    }
    await patch({ title: titleDraft.trim() });
    setEditingTitle(false);
  }

  async function saveDesc() {
    if (!task || descDraft === (task.description ?? "")) {
      setEditingDesc(false);
      return;
    }
    await patch({ description: descDraft });
    setEditingDesc(false);
  }

  async function addSubtask() {
    if (!task || !newSubtask.trim()) return;
    const title = newSubtask.trim();
    setNewSubtask("");
    await fetch("/api/subtasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id, title }),
    });
    fetchTask();
  }

  async function toggleSubtask(id: string, isDone: boolean) {
    setTask((t) => t ? {
      ...t,
      subtasks: t.subtasks?.map((s) => (s.id === id ? { ...s, isDone: !isDone } : s)),
    } : t);
    await fetch(`/api/subtasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDone: !isDone }),
    });
  }

  async function postComment() {
    if (!task || !newComment.trim()) return;
    setPosting(true);
    try {
      const content = newComment.trim();
      setNewComment("");
      await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      fetchTask();
    } finally { setPosting(false); }
  }

  async function deleteTask() {
    if (!task) return;
    const ok = await confirm({
      title: "Delete task?",
      description: `"${task.title}" will be permanently removed.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    success({ title: "Task deleted" });
    onUpdate?.();
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="!w-full !max-w-[480px] sm:!max-w-[480px] !gap-0 !p-0"
      >
        {loading || !task ? (
          <div className="p-6 space-y-4">
            <div className="h-6 rounded bg-gray-100 animate-pulse w-2/3" />
            <div className="h-4 rounded bg-gray-100 animate-pulse" />
            <div className="h-4 rounded bg-gray-100 animate-pulse w-3/4" />
            <div className="h-32 rounded-lg bg-gray-100 animate-pulse" />
          </div>
        ) : (
          <>
            {/* ── Header ── */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-2">
              {task.project && (
                <Link
                  href={`/projects/${task.project.id}`}
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#2d5200] truncate"
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: task.project.color }} />
                  <span className="truncate">{task.project.name}</span>
                </Link>
              )}
              {task.client && (
                <>
                  <span className="text-gray-300 text-xs">/</span>
                  <Link
                    href={`/clients/${task.client.id}`}
                    onClick={() => onOpenChange(false)}
                    className="text-xs text-gray-500 hover:text-[#2d5200] truncate"
                  >
                    {task.client.name}
                  </Link>
                </>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Link
                  href={`/tasks/${task.id}`}
                  onClick={() => onOpenChange(false)}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                  title="Open full page"
                >
                  <ExternalLink size={13} />
                </Link>
                <button
                  onClick={deleteTask}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
                <button
                  onClick={() => onOpenChange(false)}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                  title="Close (Esc)"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-5 pt-6 pb-4 space-y-5">
              {/* Title */}
              {editingTitle ? (
                <Input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTitle();
                    if (e.key === "Escape") { setTitleDraft(task.title); setEditingTitle(false); }
                  }}
                  autoFocus
                  className="text-xl font-bold border-[#99ff33]/50 focus:border-[#99ff33] focus:ring-[#99ff33]/30 px-2 h-auto py-2"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingTitle(true)}
                  className="text-xl font-bold text-gray-900 leading-tight hover:bg-gray-50 rounded px-2 -mx-2 py-1.5 w-full text-left flex items-start gap-1.5 group"
                >
                  <span className="flex-1">{task.title}</span>
                  <Pencil size={11} className="text-gray-300 opacity-0 group-hover:opacity-100 mt-1.5 transition-opacity" />
                </button>
              )}

              {/* Properties */}
              <div className="grid grid-cols-[80px_1fr] gap-y-2 gap-x-3 text-sm">
                <PropLabel icon={CircleDot}>Status</PropLabel>
                <Select value={task.status} onValueChange={(v) => v && patch({ status: v })}>
                  <SelectTrigger className="h-7 border-gray-200 w-fit min-w-32">
                    <SelectValue><StatusPill status={task.status} showDot={false} className="border-0 px-0" /></SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <PropLabel icon={Flag}>Priority</PropLabel>
                <Select value={task.priority} onValueChange={(v) => v && patch({ priority: v })}>
                  <SelectTrigger className="h-7 border-gray-200 w-fit min-w-32">
                    <SelectValue><PriorityPill priority={task.priority} showDot={false} className="border-0 px-0" /></SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <PropLabel icon={Calendar}>Due</PropLabel>
                <Input
                  type="date"
                  value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                  onChange={(e) => patch({ dueDate: e.target.value || null })}
                  className="h-7 border-gray-200 font-mono text-xs w-fit"
                />

                <PropLabel icon={User}>Assignee</PropLabel>
                <div className="text-sm text-gray-700 self-center">
                  {task.assignee
                    ? <span className="inline-flex items-center gap-1.5 bg-gray-100 px-2 py-0.5 rounded-full text-xs">
                        <span className="h-4 w-4 rounded-full bg-[#99ff33] text-[9px] font-bold text-[#0d1a00] flex items-center justify-center">
                          {task.assignee.name[0]?.toUpperCase()}
                        </span>
                        {task.assignee.name}
                      </span>
                    : <span className="text-gray-400 italic text-xs">Unassigned</span>}
                </div>
              </div>

              {/* Description */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1.5">Description</p>
                {editingDesc ? (
                  <Textarea
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    onBlur={saveDesc}
                    autoFocus
                    rows={5}
                    className="border-[#99ff33]/50 focus:border-[#99ff33] focus:ring-[#99ff33]/30 text-sm"
                    placeholder="Add details, context, links…"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingDesc(true)}
                    className={cn(
                      "w-full text-left text-sm rounded p-2 -mx-2 min-h-[60px] whitespace-pre-wrap hover:bg-gray-50",
                      // Real description = full-strength text. Empty = muted italic placeholder.
                      task.description ? "text-gray-800" : "text-gray-400 italic"
                    )}
                  >
                    {task.description || "Add a description…"}
                  </button>
                )}
              </div>

              {/* Subtasks */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-2 flex items-center gap-1.5">
                  <CheckSquare size={10} /> Subtasks
                  {task.subtasks && task.subtasks.length > 0 && (
                    <span className="ml-1 text-gray-500 normal-case">
                      {task.subtasks.filter((s) => s.isDone).length}/{task.subtasks.length}
                    </span>
                  )}
                </p>
                <div className="space-y-1">
                  {task.subtasks?.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={s.isDone}
                        onChange={() => toggleSubtask(s.id, s.isDone)}
                        className="h-4 w-4 rounded border-gray-300 accent-[#99ff33]"
                      />
                      <span className={cn("text-sm flex-1", s.isDone && "line-through text-gray-400")}>
                        {s.title}
                      </span>
                    </label>
                  ))}
                  <form
                    onSubmit={(e) => { e.preventDefault(); addSubtask(); }}
                    className="flex items-center gap-2 px-1.5 py-1"
                  >
                    <Plus size={12} className="text-gray-400 shrink-0" />
                    <input
                      value={newSubtask}
                      onChange={(e) => setNewSubtask(e.target.value)}
                      placeholder="Add subtask…"
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
                    />
                  </form>
                </div>
              </div>

              {/* Attachments */}
              <TaskAttachments taskId={task.id} />

              {/* Comments / activity */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-2 flex items-center gap-1.5">
                  <MessageCircle size={10} /> Comments
                  {task.comments && task.comments.length > 0 && (
                    <span className="ml-1 text-gray-500 normal-case">{task.comments.length}</span>
                  )}
                </p>
                <div className="space-y-2 mb-3">
                  {task.comments?.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50/60 border border-gray-100">
                      <div className={cn(
                        "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                        c.isAi ? "bg-[#99ff33] text-[#0d1a00]" : "bg-gray-200 text-gray-700"
                      )}>
                        {c.isAi ? "AI" : c.author?.name[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-medium text-gray-800">
                            {c.isAi ? "AI" : c.author?.name ?? "Unknown"}
                          </span>
                          <span className="text-[10px] text-gray-400">{relativeTime(c.createdAt)}</span>
                        </div>
                        <p className="text-xs text-gray-700 whitespace-pre-wrap">{c.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Write a comment… (⌘⏎ to send)"
                    rows={3}
                    className="resize-none border-gray-200 text-sm min-h-[72px]"
                  />
                  <Button
                    onClick={postComment}
                    disabled={posting || !newComment.trim()}
                    className="btn-brand h-8 self-end gap-1.5 text-xs"
                  >
                    {posting ? <Loader2 size={11} className="animate-spin" /> : <MessageCircle size={11} />}
                    Comment
                  </Button>
                </div>
              </div>
            </div>

            {/* ── Footer meta ── */}
            <div className="border-t border-gray-100 px-5 py-2 text-[10px] text-gray-400 flex items-center gap-3">
              <span className="flex items-center gap-1"><Clock size={9} /> Created {relativeTime(task.createdAt)}</span>
              <span>·</span>
              <span>Updated {relativeTime(task.updatedAt)}</span>
              {task.completedAt && (
                <>
                  <span>·</span>
                  <span className="text-green-600 font-medium">Completed {relativeTime(task.completedAt)}</span>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PropLabel({ icon: Icon, children }: { icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-400 font-bold self-center">
      <Icon size={10} />
      {children}
    </span>
  );
}
