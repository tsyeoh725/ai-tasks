"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ProjectClientsPanel } from "@/components/project-clients-panel";
import {
  Building2,
  Tag,
  Users,
  Target,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Calendar,
  Pencil,
  Check,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  category?: string | null;
  icon?: string | null;
  clientName?: string | null;
  clientId?: string | null;
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

type StatusDraft = {
  status: StatusValue;
  summary: string;
  highlights: string[];
  blockers: string[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<StatusValue, { label: string; dot: string; badge: string; border: string; bg: string }> = {
  on_track: {
    label: "On Track",
    dot: "bg-green-500",
    badge: "bg-green-50 text-green-700 border-green-200",
    border: "border-l-green-500",
    bg: "bg-green-500/5",
  },
  at_risk: {
    label: "At Risk",
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    border: "border-l-amber-500",
    bg: "bg-amber-500/5",
  },
  off_track: {
    label: "Off Track",
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 border-red-200",
    border: "border-l-red-500",
    bg: "bg-red-500/5",
  },
  on_hold: {
    label: "On Hold",
    dot: "bg-gray-400",
    badge: "bg-gray-100 text-gray-600 border-gray-200",
    border: "border-l-gray-400",
    bg: "bg-gray-500/5",
  },
  complete: {
    label: "Complete",
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    border: "border-l-blue-500",
    bg: "bg-blue-500/5",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function avatarInitial(name: string) {
  return name[0]?.toUpperCase() ?? "?";
}

// ─── Inline editable text field ───────────────────────────────────────────────

function InlineEditText({
  value,
  placeholder,
  onSave,
}: {
  value: string;
  placeholder?: string;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-6 text-sm px-1.5 py-0 border-[#99ff33]/50"
          disabled={saving}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-green-600 hover:text-green-700 disabled:opacity-40"
          aria-label="Save"
        >
          <Check className="size-3.5" />
        </button>
        <button
          onClick={() => { setDraft(value); setEditing(false); }}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Cancel"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      className="group/edit flex items-center gap-1 text-sm text-gray-800 hover:text-gray-900 min-w-0"
    >
      <span className="truncate">{value || <span className="text-gray-400 italic">{placeholder ?? "—"}</span>}</span>
      <Pencil className="size-3 text-gray-300 group-hover/edit:text-gray-500 shrink-0 transition-colors" />
    </button>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string; // Tailwind border-l color class
}) {
  return (
    <div className={cn("bg-white rounded-xl border border-gray-200 shadow-sm border-l-4 px-4 py-3 flex items-center gap-3", accent)}>
      <Icon className="size-4 text-gray-400 shrink-0" />
      <div className="min-w-0">
        <p className="text-2xl font-semibold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{label}</p>
      </div>
    </div>
  );
}

// ─── Property row ─────────────────────────────────────────────────────────────

function PropRow({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-1.5 w-28 shrink-0 pt-0.5">
        <Icon className="size-3.5 text-gray-400 shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ─── Status form ──────────────────────────────────────────────────────────────

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
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 block mb-1.5">Status</label>
        <Select value={status} onValueChange={(v) => v && setStatus(v as StatusValue)}>
          <SelectTrigger className="w-full">
            <SelectValue>{STATUS_META[status]?.label ?? status}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(STATUS_META) as [StatusValue, typeof STATUS_META[StatusValue]][]).map(([v, m]) => (
              <SelectItem key={v} value={v}>
                <span className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full shrink-0", m.dot)} />
                  {m.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 block mb-1.5">Summary</label>
        <Textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          placeholder="What's the current state of the project?"
          className="resize-none"
        />
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 block mb-1.5">Highlights</label>
        <div className="space-y-1.5">
          {highlights.map((h, i) => (
            <div key={i} className="flex gap-1.5">
              <Input
                value={h}
                onChange={(e) => updateItem("highlights", i, e.target.value)}
                placeholder="Something notable"
              />
              {highlights.length > 1 && (
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeItem("highlights", i)}>
                  <X className="size-3.5" />
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
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 block mb-1.5">Blockers</label>
        <div className="space-y-1.5">
          {blockers.map((b, i) => (
            <div key={i} className="flex gap-1.5">
              <Input
                value={b}
                onChange={(e) => updateItem("blockers", i, e.target.value)}
                placeholder="What's in the way?"
              />
              {blockers.length > 1 && (
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeItem("blockers", i)}>
                  <X className="size-3.5" />
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
        <Button variant="primary" size="sm" onClick={submit} disabled={submitting || !summary.trim()}>
          {submitting ? "Posting…" : "Post update"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProjectOverview({ project }: { project: ProjectDetail }) {
  // ── Remote state ──────────────────────────────────────────────────────────
  const [updates, setUpdates] = useState<StatusUpdate[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiDraft, setAiDraft] = useState<StatusDraft | undefined>(undefined);
  const [aiLoading, setAiLoading] = useState(false);

  // ── Linked client (from clientId FK) ─────────────────────────────────────
  const [linkedClient, setLinkedClient] = useState<{ id: string; name: string } | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

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

    // Fetch project detail and resolve linked client
    const projRes = await fetch(`/api/projects/${project.id}`);
    if (projRes.ok) {
      const proj = await projRes.json();
      if (proj.clientId) {
        const clientRes = await fetch(`/api/clients/${proj.clientId}`);
        if (clientRes.ok) {
          const client = await clientRes.json();
          setLinkedClient({ id: client.id, name: client.name });
        }
      } else {
        setLinkedClient(null);
      }
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

  // ── Derived data ──────────────────────────────────────────────────────────

  const latest = updates[0];
  const latestMeta = latest ? STATUS_META[latest.status] : null;

  const milestones = useMemo(() => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    return tasks
      .filter((t) => t.isMilestone)
      .filter((t) => t.dueDate && new Date(t.dueDate) <= soon)
      .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  }, [tasks]);

  const linkedGoals = useMemo(
    () => goals.filter((g) => g.links.some((l) => l.entityType === "project" && l.entityId === project.id)),
    [goals, project.id],
  );

  const now = new Date();
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "done").length;
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress").length;
  const overdueTasks = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== "done",
  ).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Tasks" value={totalTasks} icon={TrendingUp} accent="border-l-gray-300" />
        <StatCard label="Completed" value={completedTasks} icon={CheckCircle2} accent="border-l-green-500" />
        <StatCard label="In Progress" value={inProgressTasks} icon={Clock} accent="border-l-blue-500" />
        <StatCard label="Overdue" value={overdueTasks} icon={AlertTriangle} accent="border-l-red-500" />
      </div>

      {/* ── Main 2-column layout ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">

        {/* ── Left column ──────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Status section */}
          <Card>
            <CardHeader className="border-b border-gray-100 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>Status</CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleDraftWithAi} disabled={aiLoading}>
                    <span aria-hidden>✨</span>
                    {aiLoading ? "Drafting…" : "Draft with AI"}
                  </Button>
                  <Dialog
                    open={dialogOpen}
                    onOpenChange={(open) => {
                      setDialogOpen(open);
                      if (!open) setAiDraft(undefined);
                    }}
                  >
                    <DialogTrigger render={<Button size="sm" variant="primary" />}>
                      Post update
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
            </CardHeader>
            <CardContent className="pt-4">
              {latest && latestMeta ? (
                <div
                  className={cn(
                    "rounded-lg border border-l-4 p-4",
                    latestMeta.border,
                    latestMeta.bg,
                  )}
                >
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className={cn("size-2 rounded-full shrink-0", latestMeta.dot)} />
                    <span className="text-sm font-semibold text-gray-900">{latestMeta.label}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {latest.author?.name} · {timeAgo(latest.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed mb-3">
                    {latest.summary}
                  </p>
                  {(() => {
                    const hs = parseJsonArray(latest.highlights);
                    const bs = parseJsonArray(latest.blockers);
                    if (!hs.length && !bs.length) return null;
                    return (
                      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-current/10">
                        {hs.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 mb-1.5">
                              Highlights
                            </p>
                            <ul className="text-sm space-y-1 text-gray-700">
                              {hs.map((h, i) => (
                                <li key={i} className="flex items-start gap-1.5">
                                  <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                                  {h}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {bs.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 mb-1.5">
                              Blockers
                            </p>
                            <ul className="text-sm space-y-1 text-gray-700">
                              {bs.map((b, i) => (
                                <li key={i} className="flex items-start gap-1.5">
                                  <span className="text-red-500 mt-0.5 shrink-0">⚠</span>
                                  {b}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <p className="text-sm text-gray-400 py-2">No status updates yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Description */}
          {project.description && (
            <Card>
              <CardHeader className="border-b border-gray-100 pb-3">
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {project.description}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Recent activity */}
          <Card>
            <CardHeader className="border-b border-gray-100 pb-3">
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              {activity.length > 0 ? (
                <ul className="divide-y divide-gray-50">
                  {activity.map((a) => {
                    const name = a.user?.name || "Someone";
                    return (
                      <li key={a.id} className="flex items-center gap-3 py-2.5">
                        <div className="size-7 rounded-full bg-[#99ff33]/15 text-[#2d5200] flex items-center justify-center text-[11px] font-semibold shrink-0">
                          {avatarInitial(name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-900">{name}</span>{" "}
                          <span className="text-sm text-gray-500">{a.action}</span>
                          {a.field && (
                            <span className="text-sm text-gray-400"> · {a.field}</span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                          {timeAgo(a.createdAt)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-gray-400 py-2">No recent activity.</p>
              )}
            </CardContent>
          </Card>

          {/* Milestones */}
          <Card>
            <CardHeader className="border-b border-gray-100 pb-3">
              <CardTitle>Milestones</CardTitle>
              <p className="text-xs text-gray-400 mt-0.5">Next 30 days</p>
            </CardHeader>
            <CardContent className="pt-3">
              {milestones.length > 0 ? (
                <ul className="space-y-0 relative before:absolute before:left-[11px] before:top-3 before:bottom-3 before:w-px before:bg-gray-100">
                  {milestones.map((m, idx) => {
                    const isPast = m.dueDate && new Date(m.dueDate) < now;
                    const isDone = m.status === "done";
                    return (
                      <li key={m.id} className="relative flex items-center gap-3 py-2.5 pl-7">
                        {/* timeline dot */}
                        <span
                          className={cn(
                            "absolute left-[6px] size-2.5 rounded-full border-2 border-white",
                            isDone ? "bg-green-500" : isPast ? "bg-red-400" : "bg-[#99ff33]",
                          )}
                        />
                        <a
                          href={`/tasks/${m.id}`}
                          className="text-sm font-medium text-gray-800 hover:text-[#2d5200] hover:underline flex-1 truncate transition-colors"
                        >
                          {m.title}
                        </a>
                        {m.dueDate && (
                          <span
                            className={cn(
                              "text-xs shrink-0 tabular-nums",
                              isPast && !isDone ? "text-red-500 font-medium" : "text-gray-400",
                            )}
                          >
                            <Calendar className="size-3 inline mr-1" />
                            {new Date(m.dueDate).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-gray-400 py-2">No upcoming milestones.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right column: Properties panel ───────────────────────────── */}
        <div className="space-y-5">
          {/* Linked clients */}
          <ProjectClientsPanel projectId={project.id} />

          <Card>
            <CardHeader className="border-b border-gray-100 pb-3">
              <CardTitle>Properties</CardTitle>
            </CardHeader>
            <CardContent className="pt-2 pb-1">

              {/* CLIENT */}
              <PropRow label="Client" icon={Building2}>
                {linkedClient ? (
                  <a
                    href={`/clients/${linkedClient.id}`}
                    className="text-sm text-gray-800 hover:text-[#2d5200] hover:underline transition-colors"
                  >
                    {linkedClient.name}
                  </a>
                ) : (
                  <span className="text-sm text-gray-400 italic">—</span>
                )}
              </PropRow>

              {/* CATEGORY */}
              <PropRow label="Category" icon={Tag}>
                {project.category && !project.category.includes(" ") ? (
                  <span className="text-sm text-gray-800 capitalize">
                    {project.category.replace(/_/g, " ")}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400 italic">—</span>
                )}
              </PropRow>

              {/* STATUS */}
              <PropRow label="Status" icon={TrendingUp}>
                {latestMeta ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border",
                      latestMeta.badge,
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", latestMeta.dot)} />
                    {latestMeta.label}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400 italic">No updates</span>
                )}
              </PropRow>

              {/* TEAM */}
              <PropRow label="Team" icon={Users}>
                {members.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {members.slice(0, 5).map((m) => (
                      <div
                        key={m.id}
                        title={`${m.user.name} (${m.role})`}
                        className="size-7 rounded-full bg-[#99ff33]/15 text-[#2d5200] flex items-center justify-center text-[11px] font-semibold border-2 border-white shadow-sm"
                      >
                        {avatarInitial(m.user.name)}
                      </div>
                    ))}
                    {members.length > 5 && (
                      <div className="size-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[11px] font-semibold border-2 border-white shadow-sm">
                        +{members.length - 5}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 italic">Personal project</span>
                )}
              </PropRow>

              {/* GOALS */}
              <PropRow label="Goals" icon={Target}>
                {linkedGoals.length > 0 ? (
                  <div className="space-y-1.5">
                    {linkedGoals.map((g) => (
                      <a
                        key={g.id}
                        href="/goals"
                        className="flex items-center justify-between gap-2 group/goal hover:text-[#2d5200] transition-colors"
                      >
                        <span className="text-sm text-gray-800 group-hover/goal:text-[#2d5200] truncate">
                          {g.title}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                          {g.progress}%
                        </span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 italic">None linked</span>
                )}
              </PropRow>
            </CardContent>
          </Card>

          {/* Members list (expanded) */}
          {members.length > 0 && (
            <Card>
              <CardHeader className="border-b border-gray-100 pb-3">
                <CardTitle>Team Members</CardTitle>
              </CardHeader>
              <CardContent className="pt-2 pb-1">
                <ul className="divide-y divide-gray-50">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-2.5 py-2.5">
                      <div className="size-7 rounded-full bg-[#99ff33]/15 text-[#2d5200] flex items-center justify-center text-[11px] font-semibold shrink-0">
                        {avatarInitial(m.user.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{m.user.name}</p>
                        <p className="text-xs text-gray-400">{m.user.email}</p>
                      </div>
                      <Badge variant="secondary" className="capitalize text-[10px] shrink-0">
                        {m.role}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
