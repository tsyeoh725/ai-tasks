"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
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
import { Separator } from "@/components/ui/separator";
import { TaskActivity } from "@/components/task-activity";
import { TaskDependencies } from "@/components/task-dependencies";
import { TaskAttachments } from "@/components/task-attachments";
import { TaskApprovals } from "@/components/task-approvals";
import { TaskCollaborators } from "@/components/task-collaborators";
import { TaskCustomFields } from "@/components/custom-fields";
import { RecurrencePicker } from "@/components/recurrence-picker";
import { cn } from "@/lib/utils";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
} from "@/lib/labels";
import { useConfirm } from "@/components/ui/confirm-dialog";

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h === 1) return "1 hour";
  return `${h} hours`;
}

type Subtask = {
  id: string;
  title: string;
  isDone: boolean;
};

type Comment = {
  id: string;
  content: string;
  isAi: boolean;
  createdAt: string;
  author?: { id: string; name: string } | null;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  taskType: "task" | "milestone" | "approval";
  dueDate: string | null;
  estimatedHours: number | null;
  projectId: string;
  project: { id: string; name: string; color: string; teamId?: string | null; ownerId?: string };
  assignee?: { id: string; name: string; email: string } | null;
  assigneeId?: string | null;
  createdBy?: { id: string; name: string } | null;
  subtasks: Subtask[];
  comments: Comment[];
  recurrenceRule?: string | null;
};

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const confirm = useConfirm();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [activeTab, setActiveTab] = useState<"comments" | "activity">("comments");
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchTask = useCallback(async () => {
    const res = await fetch(`/api/tasks/${id}`);
    if (res.ok) {
      const data = await res.json();
      setTask(data);
      setEditTitle(data.title);
      setEditDescription(data.description || "");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((data) => { if (data?.id) setCurrentUserId(data.id); })
      .catch(() => {});
  }, []);

  // Fetch assignable members
  useEffect(() => {
    if (!task) return;
    const teamId = task.project.teamId;
    if (teamId) {
      fetch(`/api/teams/${teamId}`)
        .then((r) => r.json())
        .then((data) => {
          const members = (data.members || []).map((m: { user: { id: string; name: string; email: string } }) => m.user);
          setTeamMembers(members);
        })
        .catch(() => {});
    } else {
      if (task.createdBy) {
        setTeamMembers([{ id: task.createdBy.id, name: task.createdBy.name, email: "" }]);
      }
    }
  }, [task?.project.teamId, task?.createdBy]);

  async function updateTask(updates: Record<string, unknown>) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    fetchTask();
  }

  async function saveEdits() {
    await updateTask({ title: editTitle, description: editDescription });
    setEditing(false);
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    await fetch(`/api/tasks/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: commentText.trim() }),
    });
    setCommentText("");
    setSubmitting(false);
    fetchTask();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Task not found</p>
      </div>
    );
  }

  const isDone = task.status === "done";
  const humanComments = task.comments.filter(c => !c.isAi);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-6">
        {/* Top Bar: Mark Complete + Breadcrumb + Collaborators */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Mark Complete Button */}
            <Button
              size="sm"
              variant={isDone ? "default" : "outline"}
              className={cn(
                "gap-1.5 transition-all",
                isDone && "bg-green-600 hover:bg-green-700 text-white border-green-600"
              )}
              onClick={() => updateTask({ status: isDone ? "todo" : "done" })}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {isDone ? "Completed" : "Mark complete"}
            </Button>

            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <a href={`/projects/${task.project.id}`} className="hover:text-foreground flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: task.project.color }} />
                {task.project.name}
              </a>
            </div>
          </div>

          {/* Collaborator Avatars */}
          <div className="flex items-center gap-1">
            {task.assignee && (
              <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium" title={task.assignee.name}>
                {task.assignee.name[0]?.toUpperCase()}
              </div>
            )}
            {task.createdBy && task.createdBy.id !== task.assignee?.id && (
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium -ml-1.5 ring-2 ring-background" title={task.createdBy.name}>
                {task.createdBy.name[0]?.toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Title & Description */}
        {editing ? (
          <div className="space-y-3 mb-6">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="text-xl font-bold h-auto py-2"
              autoFocus
            />
            <Textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Add description..."
              rows={4}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdits}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="mb-3 cursor-pointer group" onClick={() => setEditing(true)}>
            <h1 className={cn("text-2xl font-bold mb-2", isDone && "line-through text-muted-foreground")}>{task.title}</h1>
            <p className="text-muted-foreground whitespace-pre-wrap group-hover:text-foreground/70 transition-colors">
              {task.description || "Click to add description..."}
            </p>
          </div>
        )}

        {/* Reactions bar */}
        <div className="mb-6">
          <TaskReactions taskId={task.id} />
        </div>

        {/* Properties — Label:Value Rows */}
        <div className="space-y-3 mb-6">
          {/* Task Type */}
          <div className="flex items-center gap-2">
            <span className="w-24 text-xs font-medium text-muted-foreground uppercase flex-shrink-0">Type</span>
            <div className="flex items-center bg-muted rounded-md p-0.5">
              {(["task", "milestone", "approval"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    if (task.taskType !== t) updateTask({ taskType: t });
                  }}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded transition-colors",
                    task.taskType === t
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {TASK_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Assignee */}
          <div className="flex items-center gap-2">
            <span className="w-24 text-xs font-medium text-muted-foreground uppercase flex-shrink-0">Assignee</span>
            <div className="flex items-center gap-2 flex-1">
              {task.assignee && (
                <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-medium flex-shrink-0">
                  {task.assignee.name[0]?.toUpperCase()}
                </div>
              )}
              <Select
                value={task.assigneeId || "unassigned"}
                onValueChange={(v) => v && updateTask({ assigneeId: v === "unassigned" ? null : v })}
              >
                <SelectTrigger className="h-8 text-sm border-0 shadow-none hover:bg-accent px-2 w-auto min-w-[140px]">
                  <SelectValue placeholder="Unassigned">
                    {task.assignee
                      ? task.assignee.name
                      : task.assigneeId
                        ? task.assigneeId.slice(0, 8) + "…"
                        : "Unassigned"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {task.assigneeId && (
                <button onClick={() => updateTask({ assigneeId: null })} className="text-muted-foreground hover:text-foreground p-0.5" type="button">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </div>

          {/* Due Date */}
          {(() => {
            const dueDateObj = task.dueDate ? new Date(task.dueDate) : null;
            const dueDateStr = dueDateObj ? dueDateObj.toISOString().split("T")[0] : "";
            const hasTime = !!dueDateObj && (dueDateObj.getHours() !== 0 || dueDateObj.getMinutes() !== 0);
            const dueTimeStr = hasTime && dueDateObj
              ? `${String(dueDateObj.getHours()).padStart(2, "0")}:${String(dueDateObj.getMinutes()).padStart(2, "0")}`
              : "";
            const handleDateChange = (newDate: string) => {
              if (!newDate) {
                updateTask({ dueDate: null });
                return;
              }
              const [y, m, d] = newDate.split("-").map(Number);
              const combined = new Date(y, m - 1, d);
              if (dueDateObj) {
                combined.setHours(dueDateObj.getHours(), dueDateObj.getMinutes(), 0, 0);
              }
              updateTask({ dueDate: combined.toISOString() });
            };
            const handleTimeChange = (newTime: string) => {
              if (!dueDateObj) return; // don't allow time without a date
              if (!newTime) {
                // Clearing time — keep date, reset to 00:00
                const cleared = new Date(dueDateObj);
                cleared.setHours(0, 0, 0, 0);
                updateTask({ dueDate: cleared.toISOString() });
                return;
              }
              const [hh, mm] = newTime.split(":").map(Number);
              const combined = new Date(dueDateObj);
              combined.setHours(hh, mm, 0, 0);
              updateTask({ dueDate: combined.toISOString() });
            };
            return (
              <div className="flex items-center gap-2">
                <span className="w-24 text-xs font-medium text-muted-foreground uppercase flex-shrink-0">Due date</span>
                <div className="flex items-center gap-2 flex-1">
                  <svg className="h-4 w-4 text-muted-foreground flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <Input
                    type="date"
                    value={dueDateStr}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="h-8 text-sm border-0 shadow-none hover:bg-accent px-2 w-auto"
                  />
                  <Input
                    type="time"
                    value={dueTimeStr}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    disabled={!dueDateObj}
                    className="h-8 text-sm border-0 shadow-none hover:bg-accent px-2 w-auto"
                  />
                  {task.dueDate && (
                    <button onClick={() => updateTask({ dueDate: null })} className="text-muted-foreground hover:text-foreground p-0.5" type="button">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="w-24 text-xs font-medium text-muted-foreground uppercase flex-shrink-0">Status</span>
            <Select value={task.status} onValueChange={(v) => v && updateTask({ status: v })}>
              <SelectTrigger className="h-8 text-sm border-0 shadow-none hover:bg-accent px-2 w-auto min-w-[140px]">
                <SelectValue>
                  {TASK_STATUS_LABELS[task.status] || task.status}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todo">{TASK_STATUS_LABELS.todo}</SelectItem>
                <SelectItem value="in_progress">{TASK_STATUS_LABELS.in_progress}</SelectItem>
                <SelectItem value="done">{TASK_STATUS_LABELS.done}</SelectItem>
                <SelectItem value="blocked">{TASK_STATUS_LABELS.blocked}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className="flex items-center gap-2">
            <span className="w-24 text-xs font-medium text-muted-foreground uppercase flex-shrink-0">Priority</span>
            <div className="flex items-center gap-2">
              <span className={cn(
                "h-2.5 w-2.5 rounded-full flex-shrink-0",
                task.priority === "urgent" && "bg-red-500",
                task.priority === "high" && "bg-orange-500",
                task.priority === "medium" && "bg-yellow-500",
                task.priority === "low" && "bg-blue-400",
              )} />
              <Select value={task.priority} onValueChange={(v) => v && updateTask({ priority: v })}>
                <SelectTrigger className="h-8 text-sm border-0 shadow-none hover:bg-accent px-2 w-auto min-w-[100px]">
                  <SelectValue>
                    {TASK_PRIORITY_LABELS[task.priority] || task.priority}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{TASK_PRIORITY_LABELS.low}</SelectItem>
                  <SelectItem value="medium">{TASK_PRIORITY_LABELS.medium}</SelectItem>
                  <SelectItem value="high">{TASK_PRIORITY_LABELS.high}</SelectItem>
                  <SelectItem value="urgent">{TASK_PRIORITY_LABELS.urgent}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Estimate */}
          <div className="flex items-center gap-2">
            <span className="w-24 text-xs font-medium text-muted-foreground uppercase flex-shrink-0">Estimate</span>
            <Select
              value={task.estimatedHours ? String(task.estimatedHours) : "auto"}
              onValueChange={(v) => v && updateTask({ estimatedHours: v === "auto" ? null : Number(v) })}
            >
              <SelectTrigger className="w-40 h-8 border-0 bg-transparent hover:bg-accent">
                <SelectValue>
                  {task.estimatedHours
                    ? formatHours(task.estimatedHours)
                    : <span className="text-muted-foreground">Auto (AI decides)</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (AI decides)</SelectItem>
                <SelectItem value="0.25">15 min</SelectItem>
                <SelectItem value="0.5">30 min</SelectItem>
                <SelectItem value="1">1 hour</SelectItem>
                <SelectItem value="2">2 hours</SelectItem>
                <SelectItem value="4">4 hours</SelectItem>
                <SelectItem value="8">8 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Projects */}
          <div className="flex items-center gap-2">
            <span className="w-24 text-xs font-medium text-muted-foreground uppercase flex-shrink-0">Project</span>
            <a href={`/projects/${task.project.id}`} className="flex items-center gap-1.5 text-sm hover:underline">
              <span className="h-3 w-3 rounded" style={{ backgroundColor: task.project.color }} />
              {task.project.name}
            </a>
          </div>

          {/* Recurrence */}
          <div className="flex items-center gap-2">
            <span className="w-24 text-xs font-medium text-muted-foreground uppercase flex-shrink-0">Recurrence</span>
            <RecurrencePicker
              value={task.recurrenceRule ? (() => { try { return JSON.parse(task.recurrenceRule); } catch { return null; } })() : null}
              onChange={(rule) => updateTask({ recurrenceRule: rule })}
            />
          </div>
        </div>

        {/* Custom Fields */}
        <TaskCustomFields taskId={task.id} projectId={task.projectId} />

        <Separator className="my-6" />

        {/* Description Section Label */}
        {!editing && task.description && (
          <>
            <div className="mb-6">
              <h3 className="text-xs font-medium text-muted-foreground uppercase mb-2">Description</h3>
              <p className="text-sm whitespace-pre-wrap cursor-pointer hover:bg-accent/50 rounded p-2 -mx-2 transition-colors" onClick={() => setEditing(true)}>
                {task.description}
              </p>
            </div>
            <Separator className="my-6" />
          </>
        )}

        {/* Dependencies */}
        <div className="mb-6">
          <h3 className="font-medium mb-3">Dependencies</h3>
          <TaskDependencies taskId={task.id} />
        </div>

        <Separator className="my-6" />

        {/* Subtasks */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-medium">Subtasks</h3>
            {task.subtasks.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {task.subtasks.filter(s => s.isDone).length}/{task.subtasks.length}
              </span>
            )}
          </div>
          <div className="space-y-1">
            {task.subtasks.map((st) => (
              <div key={st.id} className="flex items-center gap-2 py-1 px-2 -mx-2 rounded hover:bg-accent/50 transition-colors">
                <input
                  type="checkbox"
                  checked={st.isDone}
                  onChange={async () => {
                    await fetch(`/api/subtasks/${st.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ isDone: !st.isDone }),
                    });
                    fetchTask();
                  }}
                  className="h-4 w-4 rounded"
                />
                <span className={cn("text-sm flex-1", st.isDone && "line-through text-muted-foreground")}>
                  {st.title}
                </span>
              </div>
            ))}
          </div>
          <SubtaskInput taskId={task.id} onAdded={fetchTask} />
        </div>

        <Separator className="my-6" />

        {/* Attachments */}
        <div className="mb-6">
          <h3 className="font-medium mb-3">Attachments</h3>
          <TaskAttachments taskId={task.id} />
        </div>

        <Separator className="my-6" />

        {/* Collaborators */}
        <div className="mb-6">
          <h3 className="font-medium mb-3">Collaborators</h3>
          <TaskCollaborators taskId={task.id} projectTeamId={task.project.teamId} />
        </div>

        <Separator className="my-6" />

        {/* Approvals */}
        <div className="mb-6">
          <h3 className="font-medium mb-3">Approvals</h3>
          <TaskApprovals taskId={task.id} projectTeamId={task.project.teamId} />
        </div>

        <Separator className="my-6" />

        {/* Comments & Activity — Merged at bottom like Asana */}
        <div className="mb-6">
          <div className="flex items-center gap-1 border-b mb-4">
            <button
              onClick={() => setActiveTab("comments")}
              className={cn(
                "text-sm font-medium py-2 px-3 border-b-2 transition-colors",
                activeTab === "comments"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              type="button"
            >
              Comments
              {humanComments.length > 0 && (
                <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5 py-0.5">{humanComments.length}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("activity")}
              className={cn(
                "text-sm font-medium py-2 px-3 border-b-2 transition-colors",
                activeTab === "activity"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              type="button"
            >
              All activity
            </button>
          </div>

          {activeTab === "comments" && (
            <div className="space-y-4">
              {humanComments.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No comments yet. Start the conversation!
                </p>
              )}
              {humanComments.map(comment => (
                <div key={comment.id} className="flex gap-3 group">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium flex-shrink-0">
                    {comment.author?.name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{comment.author?.name || "Unknown"}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(comment.createdAt).toLocaleString()}
                      </span>
                      {currentUserId && comment.author?.id === currentUserId && (
                        <button
                          type="button"
                          onClick={async () => {
                            await fetch(`/api/tasks/${id}/comments/${comment.id}`, { method: "DELETE" });
                            fetchTask();
                          }}
                          className="opacity-0 group-hover:opacity-100 ml-auto text-xs text-muted-foreground hover:text-destructive transition-opacity"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{comment.content}</p>
                  </div>
                </div>
              ))}

              {/* Comment input */}
              <form onSubmit={handleAddComment} className="flex gap-3 pt-2">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium flex-shrink-0">
                  ?
                </div>
                <div className="flex-1 flex gap-2">
                  <Textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    rows={2}
                    className="text-sm resize-none flex-1"
                  />
                  <Button type="submit" size="sm" disabled={!commentText.trim() || submitting} className="self-end">
                    Post
                  </Button>
                </div>
              </form>
            </div>
          )}

          {activeTab === "activity" && (
            <TaskActivity taskId={task.id} />
          )}
        </div>

        {/* Delete */}
        <div className="pt-4 pb-8 border-t">
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              const ok = await confirm({
                title: "Delete task?",
                description: `"${task.title}" and its comments, subtasks, and activity will be permanently removed.`,
                confirmLabel: "Delete",
                variant: "destructive",
              });
              if (!ok) return;
              await fetch(`/api/tasks/${id}`, { method: "DELETE" });
              router.push(`/projects/${task.project.id}`);
            }}
          >
            Delete Task
          </Button>
        </div>
      </div>
    </div>
  );
}

function SubtaskInput({ taskId, onAdded }: { taskId: string; onAdded: () => void }) {
  const [title, setTitle] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    await fetch("/api/subtasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, title: title.trim() }),
    });

    setTitle("");
    onAdded();
  }

  return (
    <form onSubmit={handleAdd} className="flex gap-2 mt-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add subtask..."
        className="text-sm"
      />
      <Button type="submit" size="sm" variant="secondary">Add</Button>
    </form>
  );
}

type Reaction = {
  id: string;
  emoji: string;
  userId: string;
  user?: { id: string; name: string } | null;
};

const COMMON_EMOJIS = ["\u{1F44D}", "\u2764\uFE0F", "\u{1F389}", "\u{1F680}", "\u{1F440}", "\u{1F525}", "\u{1F91D}", "\u{1F914}"];

function TaskReactions({ taskId }: { taskId: string }) {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}/reactions`);
    if (res.ok) {
      const data = await res.json();
      setReactions(data.reactions || []);
    }
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setCurrentUserId(data?.user?.id ?? null))
      .catch(() => {});
  }, []);

  async function toggle(emoji: string) {
    setPickerOpen(false);
    await fetch(`/api/tasks/${taskId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    load();
  }

  // Group by emoji
  const grouped = new Map<string, Reaction[]>();
  for (const r of reactions) {
    if (!grouped.has(r.emoji)) grouped.set(r.emoji, []);
    grouped.get(r.emoji)!.push(r);
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap relative">
      {Array.from(grouped.entries()).map(([emoji, list]) => {
        const mine = currentUserId ? list.some((r) => r.userId === currentUserId) : false;
        const names = list.map((r) => r.user?.name || "").filter(Boolean).join(", ");
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => toggle(emoji)}
            title={names || undefined}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition-colors",
              mine
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-muted/50 border-transparent hover:bg-muted"
            )}
          >
            <span>{emoji}</span>
            <span className="font-medium">{list.length}</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        className="inline-flex items-center justify-center h-6 w-6 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground hover:border-muted-foreground/80 transition-colors"
        aria-label="Add reaction"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {pickerOpen && (
        <div className="absolute top-full mt-1 left-0 z-20 bg-popover border rounded-md shadow-md p-1 flex gap-0.5">
          {COMMON_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => toggle(e)}
              className="h-7 w-7 rounded hover:bg-accent text-base flex items-center justify-center"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
