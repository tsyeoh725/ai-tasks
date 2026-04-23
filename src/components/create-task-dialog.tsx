"use client";

import { useState, useEffect } from "react";
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

type ProjectOption = { id: string; name: string; color: string };
type UserOption = { id: string; name: string; email: string };

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

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  // Default due date = tomorrow (YYYY-MM-DD in local time so the date input accepts it)
  const tomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState(defaultStatus || "todo");
  const [dueDate, setDueDate] = useState(tomorrowStr);
  const [loading, setLoading] = useState(false);

  // When no projectId is supplied, show a project picker inside the dialog.
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  // Assignee — defaults to the current user
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);

  // Default assignee to the current user whenever the dialog opens
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

  // Load project team members for assignee picker (falls back to just the current user)
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

    // Fetch the project to see if it has a team
    fetch(`/api/projects/${activeProjectId}`)
      .then((r) => r.json())
      .then(async (project) => {
        const me: UserOption | null = currentUserId
          ? { id: currentUserId, name: session?.user?.name || "You", email: session?.user?.email || "" }
          : null;

        if (project?.teamId) {
          // Get team members
          const teamRes = await fetch(`/api/teams/${project.teamId}/members`);
          const teamData = await teamRes.json();
          const members: UserOption[] = (teamData.members || []).map((m: { userId: string; name: string; email: string }) => ({
            id: m.userId,
            name: m.name,
            email: m.email,
          }));
          // Make sure current user is in the list
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const targetProjectId = projectId || selectedProjectId;
    if (!targetProjectId) return;

    setLoading(true);

    try {
      await fetch("/api/tasks", {
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
          assigneeId: assigneeId || null,
        }),
      });

      setTitle("");
      setDescription("");
      setPriority("medium");
      setStatus(defaultStatus || "todo");
      setDueDate(tomorrowStr());
      setAssigneeId(currentUserId || "");
      setOpen(false);
      onCreated?.();
    } finally {
      setLoading(false);
    }
  }

  const showProjectPicker = !projectId;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger
          render={trigger ? (props) => <button {...props} type="button">{trigger}</button> : <Button variant="outline" size="sm" />}
        >
          {!trigger && (
            <>
              <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Task
            </>
          )}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details..."
              rows={3}
            />
          </div>
          {showProjectPicker && (
            <div className="space-y-2">
              <Label>Project</Label>
              {projects.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No projects available. Create a project first.
                </p>
              ) : (
                <Select value={selectedProjectId} onValueChange={(v) => v && setSelectedProjectId(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(() => {
                        const p = projects.find((p) => p.id === selectedProjectId);
                        if (!p) return <span className="text-muted-foreground">Select a project</span>;
                        return (
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: p.color }}
                            />
                            {p.name}
                          </span>
                        );
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          {p.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => v && setPriority(v)}>
                <SelectTrigger>
                  <SelectValue>
                    {TASK_PRIORITY_LABELS[priority] || priority}
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
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                <SelectTrigger>
                  <SelectValue>
                    {TASK_STATUS_LABELS[status] || status}
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
          </div>
          <div className="space-y-2">
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
                <SelectItem value="unassigned">
                  <span className="text-muted-foreground">Unassigned</span>
                </SelectItem>
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
          <div className="space-y-2">
            <Label htmlFor="dueDate">Due Date</Label>
            <Input
              id="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={loading || (showProjectPicker && !selectedProjectId)}
          >
            {loading ? "Creating..." : "Create Task"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
