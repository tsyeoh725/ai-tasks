"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type StatusValue = "on_track" | "at_risk" | "off_track" | "on_hold" | "complete";

type Author = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

type StatusUpdate = {
  id: string;
  projectId: string;
  status: StatusValue;
  summary: string;
  highlights: string | null;
  blockers: string | null;
  createdAt: string;
  author: Author;
};

type ProjectDetail = {
  id: string;
  name: string;
  color: string;
  description: string | null;
  teamId: string | null;
};

type TeamMember = {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string };
};

type TaskLite = {
  id: string;
  title: string;
  dueDate: string | null;
  isMilestone?: boolean;
  status: string;
};

type ActivityEntry = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
};

type Goal = {
  id: string;
  title: string;
  status: string;
  progress: number;
  links: { entityType: string; entityId: string }[];
};

const statusStyles: Record<StatusValue, { border: string; bg: string; label: string; dot: string }> = {
  on_track: {
    border: "border-l-green-500",
    bg: "bg-green-500/5",
    dot: "bg-green-500",
    label: "On Track",
  },
  at_risk: {
    border: "border-l-amber-500",
    bg: "bg-amber-500/5",
    dot: "bg-amber-500",
    label: "At Risk",
  },
  off_track: {
    border: "border-l-red-500",
    bg: "bg-red-500/5",
    dot: "bg-red-500",
    label: "Off Track",
  },
  on_hold: {
    border: "border-l-gray-400",
    bg: "bg-gray-500/5",
    dot: "bg-gray-400",
    label: "On Hold",
  },
  complete: {
    border: "border-l-blue-500",
    bg: "bg-blue-500/5",
    dot: "bg-blue-500",
    label: "Complete",
  },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function parseJsonArray(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

type StatusDraft = {
  status: StatusValue;
  summary: string;
  highlights: string[];
  blockers: string[];
};

function StatusForm({
  projectId,
  initialDraft,
  onCreated,
  onCancel,
}: {
  projectId: string;
  initialDraft?: StatusDraft;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<StatusValue>(initialDraft?.status ?? "on_track");
  const [summary, setSummary] = useState(initialDraft?.summary ?? "");
  const [highlights, setHighlights] = useState<string[]>(
    initialDraft && initialDraft.highlights.length > 0 ? initialDraft.highlights : [""],
  );
  const [blockers, setBlockers] = useState<string[]>(
    initialDraft && initialDraft.blockers.length > 0 ? initialDraft.blockers : [""],
  );
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!summary.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/projects/${projectId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          summary,
          highlights: highlights.filter((h) => h.trim()),
          blockers: blockers.filter((b) => b.trim()),
        }),
      });
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  function updateItem(kind: "highlights" | "blockers", idx: number, value: string) {
    const setter = kind === "highlights" ? setHighlights : setBlockers;
    const current = kind === "highlights" ? highlights : blockers;
    setter(current.map((v, i) => (i === idx ? value : v)));
  }

  function addItem(kind: "highlights" | "blockers") {
    if (kind === "highlights") setHighlights([...highlights, ""]);
    else setBlockers([...blockers, ""]);
  }

  function removeItem(kind: "highlights" | "blockers", idx: number) {
    if (kind === "highlights") setHighlights(highlights.filter((_, i) => i !== idx));
    else setBlockers(blockers.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium block mb-1">Status</label>
        <Select value={status} onValueChange={(v) => v && setStatus(v as StatusValue)}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {statusStyles[status]?.label ?? status}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="on_track">On Track</SelectItem>
            <SelectItem value="at_risk">At Risk</SelectItem>
            <SelectItem value="off_track">Off Track</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium block mb-1">Summary</label>
        <Textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          placeholder="What's the current state of the project?"
        />
      </div>

      <div>
        <label className="text-sm font-medium block mb-1">Highlights</label>
        <div className="space-y-2">
          {highlights.map((h, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={h}
                onChange={(e) => updateItem("highlights", i, e.target.value)}
                placeholder="Something notable"
              />
              {highlights.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeItem("highlights", i)}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              )}
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => addItem("highlights")}>
            + Add highlight
          </Button>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium block mb-1">Blockers</label>
        <div className="space-y-2">
          {blockers.map((b, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={b}
                onChange={(e) => updateItem("blockers", i, e.target.value)}
                placeholder="What's in the way?"
              />
              {blockers.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeItem("blockers", i)}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              )}
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => addItem("blockers")}>
            + Add blocker
          </Button>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={submitting || !summary.trim()}>
          {submitting ? "Posting..." : "Post update"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function ProjectOverview({ project }: { project: ProjectDetail }) {
  const [updates, setUpdates] = useState<StatusUpdate[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiDraft, setAiDraft] = useState<StatusDraft | undefined>(undefined);
  const [aiLoading, setAiLoading] = useState(false);

  async function handleDraftWithAi() {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/ai-status`, { method: "POST" });
      if (!res.ok) return;
      const data = (await res.json()) as StatusDraft;
      setAiDraft(data);
      setDialogOpen(true);
    } finally {
      setAiLoading(false);
    }
  }

  const fetchAll = useCallback(async () => {
    const [updatesRes, tasksRes, activityRes, goalsRes] = await Promise.all([
      fetch(`/api/projects/${project.id}/status`),
      fetch(`/api/tasks?projectId=${project.id}`),
      fetch(`/api/activity?entityType=project&entityId=${project.id}&limit=10`),
      fetch("/api/goals"),
    ]);

    if (updatesRes.ok) {
      const data = await updatesRes.json();
      setUpdates(data.updates || []);
    }
    if (tasksRes.ok) {
      const data = await tasksRes.json();
      setTasks(data.tasks || []);
    }
    if (activityRes.ok) {
      const data = await activityRes.json();
      setActivity(data.activities || []);
    }
    if (goalsRes.ok) {
      const data = await goalsRes.json();
      setGoals(data.goals || []);
    }

    if (project.teamId) {
      const teamRes = await fetch(`/api/teams/${project.teamId}`);
      if (teamRes.ok) {
        const team = await teamRes.json();
        setMembers(team.members || []);
      }
    } else {
      setMembers([]);
    }
  }, [project.id, project.teamId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const latest = updates[0];
  const latestStyle = latest ? statusStyles[latest.status] : null;

  const milestones = useMemo(() => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    return tasks
      .filter((t) => t.isMilestone)
      .filter((t) => t.dueDate && new Date(t.dueDate) <= soon)
      .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  }, [tasks]);

  const linkedGoals = useMemo(() => {
    return goals.filter((g) =>
      g.links.some((l) => l.entityType === "project" && l.entityId === project.id),
    );
  }, [goals, project.id]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Status</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleDraftWithAi} disabled={aiLoading}>
              <span className="mr-1" aria-hidden>{"\u2728"}</span>
              {aiLoading ? "Drafting..." : "Draft with AI"}
            </Button>
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) setAiDraft(undefined);
              }}
            >
              <DialogTrigger render={<Button size="sm" variant="outline" />}>
                Update status
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Post a status update</DialogTitle>
                </DialogHeader>
                <StatusForm
                  key={aiDraft ? "ai" : "manual"}
                  projectId={project.id}
                  initialDraft={aiDraft}
                  onCreated={() => {
                    setDialogOpen(false);
                    setAiDraft(undefined);
                    fetchAll();
                  }}
                  onCancel={() => {
                    setDialogOpen(false);
                    setAiDraft(undefined);
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
        {latest && latestStyle ? (
          <div
            className={cn(
              "border border-l-4 rounded-lg p-4",
              latestStyle.border,
              latestStyle.bg,
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={cn("h-2 w-2 rounded-full", latestStyle.dot)} />
              <span className="text-sm font-semibold">{latestStyle.label}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {latest.author?.name} • {timeAgo(latest.createdAt)}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap mb-3">{latest.summary}</p>
            {(() => {
              const hs = parseJsonArray(latest.highlights);
              const bs = parseJsonArray(latest.blockers);
              return (
                <div className="grid grid-cols-2 gap-4">
                  {hs.length > 0 && (
                    <div>
                      <p className="text-xs uppercase font-semibold text-muted-foreground mb-1">Highlights</p>
                      <ul className="text-sm space-y-1 list-disc list-inside">
                        {hs.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {bs.length > 0 && (
                    <div>
                      <p className="text-xs uppercase font-semibold text-muted-foreground mb-1">Blockers</p>
                      <ul className="text-sm space-y-1 list-disc list-inside">
                        {bs.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground border rounded-lg p-4">
            No status updates yet.
          </p>
        )}
      </section>

      {project.description && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Description</h2>
          <p className="text-sm text-foreground/90 whitespace-pre-wrap">{project.description}</p>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-2">Members</h2>
        {members.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 border rounded-lg">
                <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-medium">
                  {m.user.name[0]?.toUpperCase() || "?"}
                </div>
                <span className="text-sm">{m.user.name}</span>
                <span className="text-[10px] text-muted-foreground uppercase">{m.role}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Personal project — no team members.</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Key milestones (next 30 days)</h2>
        {milestones.length > 0 ? (
          <ul className="space-y-2">
            {milestones.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 p-3 border rounded-lg"
              >
                <span className="h-2 w-2 rounded-full bg-primary" />
                <a href={`/tasks/${m.id}`} className="text-sm font-medium hover:underline flex-1">
                  {m.title}
                </a>
                {m.dueDate && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(m.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No upcoming milestones.</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Recent activity</h2>
        {activity.length > 0 ? (
          <ul className="space-y-1">
            {activity.map((a) => (
              <li key={a.id} className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="text-xs text-foreground">{a.user?.name || "Someone"}</span>
                <span>{a.action}</span>
                {a.field && <span className="text-xs">({a.field})</span>}
                <span className="text-xs ml-auto">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No recent activity.</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Linked goals</h2>
        {linkedGoals.length > 0 ? (
          <ul className="space-y-2">
            {linkedGoals.map((g) => (
              <li key={g.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                  <circle cx="12" cy="12" r="6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                  <circle cx="12" cy="12" r="2" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                </svg>
                <a href={`/goals`} className="text-sm font-medium hover:underline flex-1">{g.title}</a>
                <span className="text-xs text-muted-foreground">{g.progress}%</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No goals linked to this project.</p>
        )}
      </section>
    </div>
  );
}
