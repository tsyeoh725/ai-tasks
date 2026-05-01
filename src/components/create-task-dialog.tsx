"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from "@/lib/labels";
import { Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/components/ui/toast";

type ProjectOption = { id: string; name: string; color: string; icon?: string | null; category?: string | null; clientId?: string | null; clientName?: string | null };
type UserOption = { id: string; name: string; email: string };
type TaskOption = { id: string; title: string };

type Props = {
  projectId?: string;
  onCreated?: () => void;
  trigger?: React.ReactNode;
  defaultStatus?: string;
  defaultSectionId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function CreateTaskDialog({
  projectId,
  onCreated,
  trigger,
  defaultStatus,
  defaultSectionId,
  open: openProp,
  onOpenChange,
}: Props) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id as string | undefined;
  const { success } = useToast();

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const tomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState(defaultStatus || "todo");
  const [dueDate, setDueDate] = useState(tomorrowStr);
  const [startDate, setStartDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Tags
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Subtasks
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subtaskInput, setSubtaskInput] = useState("");

  // Dependencies
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [availableTasks, setAvailableTasks] = useState<TaskOption[]>([]);

  // Project picker
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  // Assignee
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);

  useEffect(() => {
    if (open && currentUserId && !assigneeId) {
      setAssigneeId(currentUserId);
    }
  }, [open, currentUserId, assigneeId]);

  useEffect(() => {
    if (open && !projectId) {
      fetch("/api/projects")
        .then((r) => r.json())
        .then((data) => {
          const list: ProjectOption[] = data.projects || [];
          setProjects(list);
          if (list.length > 0 && !selectedProjectId) {
            setSelectedProjectId(list[0].id);
          }
        })
        .catch(() => {});
    }
  }, [open, projectId, selectedProjectId]);

  // Load team members for assignee picker
  useEffect(() => {
    if (!open) return;
    const activeProjectId = projectId || selectedProjectId;
    if (!activeProjectId) {
      if (session?.user) {
        setAvailableUsers([
          { id: currentUserId!, name: session.user.name || "You", email: session.user.email || "" },
        ]);
      }
      return;
    }

    fetch(`/api/projects/${activeProjectId}`)
      .then((r) => r.json())
      .then(async (project) => {
        const me: UserOption | null = currentUserId
          ? { id: currentUserId, name: session?.user?.name || "You", email: session?.user?.email || "" }
          : null;

        if (project?.teamId) {
          const teamRes = await fetch(`/api/teams/${project.teamId}/members`);
          const teamData = await teamRes.json();
          const members: UserOption[] = (teamData.members || []).map((m: { userId: string; name: string; email: string }) => ({
            id: m.userId,
            name: m.name,
            email: m.email,
          }));
          if (me && !members.find((u) => u.id === me.id)) members.unshift(me);
          setAvailableUsers(members);
        } else if (me) {
          setAvailableUsers([me]);
        }
      })
      .catch(() => {
        if (currentUserId) {
          setAvailableUsers([
            { id: currentUserId, name: session?.user?.name || "You", email: session?.user?.email || "" },
          ]);
        }
      });
  }, [open, projectId, selectedProjectId, currentUserId, session?.user]);

  // Load existing tasks for dependencies (only when project selected)
  useEffect(() => {
    if (!open || !showAdvanced) return;
    const activeProjectId = projectId || selectedProjectId;
    if (!activeProjectId) return;

    fetch(`/api/tasks?projectId=${activeProjectId}&limit=50`)
      .then((r) => r.json())
      .then((data) => {
        const tasks: TaskOption[] = (data.tasks || []).map((t: { id: string; title: string }) => ({
          id: t.id,
          title: t.title,
        }));
        setAvailableTasks(tasks);
      })
      .catch(() => {});
  }, [open, showAdvanced, projectId, selectedProjectId]);

  function addTag(raw: string) {
    const trimmed = raw.trim().replace(/,+$/, "");
    if (!trimmed || tags.includes(trimmed)) return;
    setTags((prev) => [...prev, trimmed]);
  }

  function addSubtask() {
    const trimmed = subtaskInput.trim();
    if (!trimmed) return;
    setSubtasks((prev) => [...prev, trimmed]);
    setSubtaskInput("");
  }

  function reset() {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setStatus(defaultStatus || "todo");
    setDueDate(tomorrowStr());
    setStartDate("");
    setEstimatedHours("");
    setTags([]);
    setTagInput("");
    setSubtasks([]);
    setSubtaskInput("");
    setDependencies([]);
    setAssigneeId(currentUserId || "");
    setShowAdvanced(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const targetProjectId = projectId || selectedProjectId;
    if (!targetProjectId) return;

    setLoading(true);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          status,
          projectId: targetProjectId,
          sectionId: defaultSectionId || null,
          dueDate: dueDate || null,
          startDate: startDate || null,
          estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
          assigneeId: assigneeId || null,
          tags: tags.length ? JSON.stringify(tags) : null,
          subtasks: subtasks.length ? JSON.stringify(subtasks.map((s) => ({ title: s, done: false }))) : null,
          blockedBy: dependencies.length ? JSON.stringify(dependencies) : null,
        }),
      });

      if (res.ok) {
        success({ title: "Task created" });
        reset();
        setOpen(false);
        onCreated?.();
      }
    } finally {
      setLoading(false);
    }
  }

  const showProjectPicker = !projectId;
  const activeProject = projects.find((p) => p.id === (projectId || selectedProjectId));

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      {!isControlled && (
        <DialogTrigger
          render={trigger ? (props) => React.cloneElement(trigger as React.ReactElement, props) : <Button variant="outline" size="sm" />}
        >
          {!trigger && (
            <>
              <Plus className="h-4 w-4 mr-1" />
              Add Task
            </>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pb-2">

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title <span className="text-red-500">*</span></Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              required
              autoFocus
            />
          </div>

          {/* Project picker */}
          {showProjectPicker && (
            <div className="space-y-1.5">
              <Label>Project <span className="text-red-500">*</span></Label>
              {projects.length === 0 ? (
                <p className="text-xs text-muted-foreground">No projects yet. Create a project first.</p>
              ) : (
                <Select value={selectedProjectId} onValueChange={(v) => v && setSelectedProjectId(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(() => {
                        const p = projects.find((p) => p.id === selectedProjectId);
                        if (!p) return <span className="text-muted-foreground">Select a project</span>;
                        return (
                          <span className="flex items-center gap-2">
                            {p.icon ? <span className="text-sm">{p.icon}</span> : <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />}
                            <span className="truncate">{p.name}</span>
                            {p.clientName && <span className="text-[11px] text-gray-400 shrink-0">· {p.clientName}</span>}
                          </span>
                        );
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">
                          {p.icon ? <span className="text-sm">{p.icon}</span> : <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />}
                          <span className="flex-1 truncate">{p.name}</span>
                          {p.clientName && <span className="text-[11px] text-gray-400 ml-1 shrink-0">· {p.clientName}</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {activeProject?.clientName && (
                <p className="text-xs text-muted-foreground pl-0.5">Client: {activeProject.clientName}</p>
              )}
            </div>
          )}

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                <SelectTrigger>
                  <SelectValue>{TASK_STATUS_LABELS[status] || status}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">{TASK_STATUS_LABELS.todo}</SelectItem>
                  <SelectItem value="in_progress">{TASK_STATUS_LABELS.in_progress}</SelectItem>
                  <SelectItem value="done">{TASK_STATUS_LABELS.done}</SelectItem>
                  <SelectItem value="blocked">{TASK_STATUS_LABELS.blocked}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => v && setPriority(v)}>
                <SelectTrigger>
                  <SelectValue>{TASK_PRIORITY_LABELS[priority] || priority}</SelectValue>
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

          {/* Assignee */}
          <div className="space-y-1.5">
            <Label>Assignee</Label>
            <Select
              value={assigneeId || "unassigned"}
              onValueChange={(v) => v && setAssigneeId(v === "unassigned" ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(() => {
                    if (!assigneeId) return <span className="text-muted-foreground">Unassigned</span>;
                    const u = availableUsers.find((x) => x.id === assigneeId);
                    const display = u?.name || (assigneeId === currentUserId ? session?.user?.name || "You" : assigneeId);
                    const isMe = assigneeId === currentUserId;
                    return (
                      <span className="flex items-center gap-2">
                        <span className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-medium">
                          {display[0]?.toUpperCase() || "?"}
                        </span>
                        {display}
                        {isMe && <span className="text-xs text-muted-foreground">(me)</span>}
                      </span>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned"><span className="text-muted-foreground">Unassigned</span></SelectItem>
                {availableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-medium">
                        {u.name[0]?.toUpperCase() || "?"}
                      </span>
                      {u.name}
                      {u.id === currentUserId && <span className="text-xs text-muted-foreground">(me)</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-start">Start Date</Label>
              <Input id="task-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due Date</Label>
              <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details, context, or acceptance criteria..."
              rows={3}
            />
          </div>

          {/* Subtasks */}
          <div className="space-y-1.5">
            <Label>Subtasks</Label>
            {subtasks.length > 0 && (
              <div className="space-y-1 mb-1.5">
                {subtasks.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2.5 py-1.5">
                    <span className="flex-1">{s}</span>
                    <button
                      type="button"
                      onClick={() => setSubtasks((prev) => prev.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={subtaskInput}
                onChange={(e) => setSubtaskInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
                placeholder="Add a subtask..."
                className="h-8 text-sm"
              />
              <Button type="button" variant="outline" size="sm" onClick={addSubtask} className="shrink-0 h-8 w-8 p-0">
                <Plus size={14} />
              </Button>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label>Tags</Label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-0.5 text-xs">
                    {tag}
                    <button type="button" onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}>
                      <X size={10} className="text-muted-foreground hover:text-foreground" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <Input
              ref={tagInputRef}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagInput);
                  setTagInput("");
                }
                if (e.key === "Backspace" && !tagInput && tags.length > 0) {
                  setTags((prev) => prev.slice(0, -1));
                }
              }}
              onBlur={() => { if (tagInput.trim()) { addTag(tagInput); setTagInput(""); } }}
              placeholder="Type a tag, press Enter or comma..."
              className="h-8 text-sm"
            />
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showAdvanced ? "Hide" : "Show"} advanced options
          </button>

          {showAdvanced && (
            <div className="space-y-4 border-t pt-4">
              {/* Estimated hours */}
              <div className="space-y-1.5">
                <Label htmlFor="task-hours">Estimated Hours</Label>
                <Input
                  id="task-hours"
                  type="number"
                  min="0"
                  step="0.5"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  placeholder="e.g. 4"
                  className="w-32"
                />
              </div>

              {/* Dependencies */}
              {availableTasks.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Blocked By (Dependencies)</Label>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {availableTasks.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1 hover:bg-muted/50">
                        <input
                          type="checkbox"
                          checked={dependencies.includes(t.id)}
                          onChange={(e) => {
                            if (e.target.checked) setDependencies((prev) => [...prev, t.id]);
                            else setDependencies((prev) => prev.filter((id) => id !== t.id));
                          }}
                          className="rounded"
                        />
                        <span className="truncate">{t.title}</span>
                      </label>
                    ))}
                  </div>
                  {dependencies.length > 0 && (
                    <p className="text-xs text-muted-foreground">{dependencies.length} task{dependencies.length !== 1 ? "s" : ""} blocking this</p>
                  )}
                </div>
              )}
            </div>
          )}

          <Button
            type="submit"
            className="w-full btn-brand"
            disabled={loading || (showProjectPicker && !selectedProjectId)}
          >
            {loading ? "Creating…" : "Create Task"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
