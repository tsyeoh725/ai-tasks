"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users2,
  Sparkles,
  Bell,
  Plus,
  X,
  List,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type Member = {
  userId: string;
  name: string;
  email: string;
  character: string;          // sprite key
  characterColor: string;
  x: number;
  y: number;
  statusEmoji: string;
  statusText: string | null;
  isOnline: boolean;
  openTasks: number;
  isMe: boolean;
};

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  project?: { name: string; color: string } | null;
};

// Office grid dimensions
const GRID_COLS = 16;
const GRID_ROWS = 10;
const CELL_SIZE = 56;

// ─── Office furniture layout (static) ─────────────────────────────────────────
// 'D'=desk, 'C'=chair, 'P'=plant, 'T'=table, 'S'=sofa, 'F'=fridge, 'W'=wall, '.'=floor
const OFFICE_LAYOUT = [
  "WWWWWWWWWWWWWWWW",
  "W..............W",
  "W.DDDDD....TT..W",
  "W.CCCCC....TT..W",
  "W..............W",
  "W.P............W",
  "W..........DDDDW",
  "W.SS.......CCCCW",
  "W.SS....F......W",
  "WWWWWWWWWWWWWWWW",
];

const FURNITURE_META: Record<string, { emoji: string; color: string; label: string }> = {
  D: { emoji: "🖥️", color: "bg-amber-100", label: "Desk" },
  C: { emoji: "💺", color: "bg-amber-50", label: "Chair" },
  P: { emoji: "🪴", color: "bg-green-50", label: "Plant" },
  T: { emoji: "📋", color: "bg-blue-50", label: "Meeting table" },
  S: { emoji: "🛋️", color: "bg-orange-50", label: "Sofa" },
  F: { emoji: "🧊", color: "bg-cyan-50", label: "Kitchen" },
  W: { emoji: "", color: "bg-stone-200", label: "" },
  ".": { emoji: "", color: "", label: "" },
};

// ─── Character sprite library ─────────────────────────────────────────────────

const CHARACTERS = [
  { key: "dev_1", emoji: "🧑‍💻", label: "Developer" },
  { key: "designer_1", emoji: "🧑‍🎨", label: "Designer" },
  { key: "manager_1", emoji: "🧑‍💼", label: "Manager" },
  { key: "writer_1", emoji: "🧑‍🏫", label: "Writer" },
  { key: "scientist", emoji: "🧑‍🔬", label: "Strategist" },
  { key: "ninja", emoji: "🥷", label: "Ninja" },
  { key: "robot", emoji: "🤖", label: "AI Bot" },
  { key: "wizard", emoji: "🧙", label: "Wizard" },
  { key: "rocket", emoji: "🚀", label: "Rocket" },
  { key: "cat", emoji: "🐱", label: "Cat" },
  { key: "fox", emoji: "🦊", label: "Fox" },
  { key: "panda", emoji: "🐼", label: "Panda" },
];

const STATUS_EMOJIS = ["💻", "📞", "🎯", "☕", "🍕", "🎨", "💡", "🤔", "😎", "🔥", "⚡", "🌴"];

function characterEmoji(key: string) {
  return CHARACTERS.find((c) => c.key === key)?.emoji ?? "🧑‍💻";
}

// ─── Office cell ──────────────────────────────────────────────────────────────

function OfficeCell({
  type,
  member,
  isMine,
  isHighlighted,
  onClick,
  onMemberClick,
}: {
  type: string;
  member?: Member;
  isMine?: boolean;
  isHighlighted?: boolean;
  onClick?: () => void;
  onMemberClick?: () => void;
}) {
  const meta = FURNITURE_META[type] ?? FURNITURE_META["."];
  const isWall = type === "W";

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center transition-all",
        isWall
          ? "bg-stone-300/80 ring-1 ring-stone-400"
          : meta.color || "bg-amber-50/40",
        !isWall && !member && "hover:bg-[#99ff33]/15 cursor-pointer",
        isHighlighted && "ring-2 ring-[#99ff33] ring-offset-1 z-10",
      )}
      style={{ width: CELL_SIZE, height: CELL_SIZE }}
      title={meta.label}
    >
      {/* Furniture */}
      {!member && meta.emoji && (
        <span className="text-2xl opacity-70 select-none pointer-events-none">{meta.emoji}</span>
      )}

      {/* Floor pattern for empty cells */}
      {!isWall && type === "." && !meta.emoji && (
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 1px, transparent 8px)"
          }}
        />
      )}

      {/* Member character */}
      {member && (
        <button
          onClick={(e) => { e.stopPropagation(); onMemberClick?.(); }}
          className={cn(
            "relative z-10 group flex flex-col items-center justify-center w-full h-full",
            "hover:scale-110 transition-transform"
          )}
        >
          {/* Character bubble */}
          <div
            className={cn(
              "relative h-9 w-9 rounded-full flex items-center justify-center text-xl shadow-[0_2px_8px_rgb(0_0_0/0.15)] ring-2 ring-white",
              isMine && "ring-[#99ff33] shadow-[0_0_16px_rgb(153_255_51/0.5)]"
            )}
            style={{
              background: `linear-gradient(135deg, ${member.characterColor} 0%, ${member.characterColor}aa 100%)`,
            }}
          >
            <span className="leading-none">{characterEmoji(member.character)}</span>
            {/* Online indicator */}
            <span className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white",
              member.isOnline ? "bg-green-500" : "bg-gray-400"
            )} />
            {/* Status emoji */}
            {member.statusEmoji && (
              <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-white shadow-sm ring-1 ring-gray-200 flex items-center justify-center text-[9px]">
                {member.statusEmoji}
              </span>
            )}
            {/* Open tasks badge */}
            {member.openTasks > 0 && (
              <span className="absolute -top-1.5 -left-1.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-[8px] font-bold text-white flex items-center justify-center ring-2 ring-white">
                {member.openTasks}
              </span>
            )}
          </div>

          {/* Name label */}
          <span className="absolute -bottom-3.5 text-[9px] font-bold bg-white/95 px-1 rounded shadow-sm whitespace-nowrap pointer-events-none ring-1 ring-gray-200/50">
            {member.name.split(" ")[0]}
          </span>

          {/* Hover tooltip */}
          {member.statusText && (
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-[#0d1a00] text-[#99ff33] text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30 max-w-32 truncate">
              {member.statusText}
            </div>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Member detail panel ──────────────────────────────────────────────────────

function MemberPanel({
  member,
  onClose,
  onAssign,
  onPing,
}: {
  member: Member;
  onClose: () => void;
  onAssign: () => void;
  onPing: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/dep change; not migrating to Suspense
    setLoadingTasks(true);
    fetch(`/api/tasks?assignedToUserId=${member.userId}&limit=20`)
      .then((r) => r.json())
      .then((data) => setTasks(data.tasks || []))
      .catch(() => {})
      .finally(() => setLoadingTasks(false));
  }, [member.userId]);

  return (
    <div className="fixed top-0 right-0 bottom-0 w-80 bg-white border-l border-gray-200 shadow-2xl z-30 flex flex-col animate-slide-in-right">
      {/* Header */}
      <div className="p-5 border-b border-gray-200 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ background: `linear-gradient(135deg, ${member.characterColor} 0%, transparent 100%)` }} />
        <button onClick={onClose}
          className="absolute top-3 right-3 h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700">
          <X size={14} />
        </button>
        <div className="relative flex items-center gap-3">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center text-3xl shadow-lg ring-2 ring-white"
            style={{
              background: `linear-gradient(135deg, ${member.characterColor} 0%, ${member.characterColor}aa 100%)`,
            }}
          >
            {characterEmoji(member.character)}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-gray-900 truncate">{member.name}</h3>
            <p className="text-xs text-gray-500 truncate">{member.email}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className={cn("h-1.5 w-1.5 rounded-full", member.isOnline ? "bg-green-500" : "bg-gray-300")} />
              <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                {member.isOnline ? "Online" : "Away"}
              </span>
              {member.statusEmoji && <span className="text-xs ml-1">{member.statusEmoji}</span>}
            </div>
          </div>
        </div>
        {member.statusText && (
          <p className="relative mt-3 text-xs text-gray-700 italic bg-white/60 backdrop-blur-sm rounded-lg p-2 border border-gray-200">
            &quot;{member.statusText}&quot;
          </p>
        )}
      </div>

      {/* Quick actions */}
      <div className="p-3 border-b border-gray-100 grid grid-cols-2 gap-2">
        <Button onClick={onAssign} className="btn-brand h-8 text-xs gap-1.5">
          <Plus size={11} /> Assign Task
        </Button>
        <Button onClick={onPing} variant="outline" className="h-8 text-xs gap-1.5">
          <Bell size={11} /> Ping
        </Button>
      </div>

      {/* Tasks list */}
      <div className="flex-1 overflow-y-auto p-4">
        <h4 className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-2">
          Open tasks ({tasks.length})
        </h4>
        {loadingTasks ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />)}
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-xs text-gray-400 italic text-center py-6">No open tasks 🎉</p>
        ) : (
          <div className="space-y-1.5">
            {tasks.map((t) => (
              <a key={t.id} href={`/tasks/${t.id}`}
                className="block p-2.5 rounded-lg border border-gray-200 hover:border-[#99ff33]/60 hover:bg-[#99ff33]/5 transition-all">
                <div className="flex items-start gap-2">
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full mt-1.5 shrink-0",
                    t.status === "blocked" ? "bg-red-500"
                    : t.status === "in_progress" ? "bg-blue-500"
                    : "bg-gray-300"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{t.title}</p>
                    {t.project && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.project.color }} />
                        <span className="text-[10px] text-gray-500 truncate">{t.project.name}</span>
                      </div>
                    )}
                  </div>
                  {t.dueDate && (
                    <span className="text-[9px] text-gray-400 shrink-0">
                      {new Date(t.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── My settings popover ──────────────────────────────────────────────────────

function MySettingsDialog({ me, onUpdate }: { me: Member | null; onUpdate: () => void }) {
  const [open, setOpen] = useState(false);
  const [character, setCharacter] = useState(me?.character ?? "dev_1");
  const [characterColor, setCharacterColor] = useState(me?.characterColor ?? "#99ff33");
  const [statusEmoji, setStatusEmoji] = useState(me?.statusEmoji ?? "💻");
  const [statusText, setStatusText] = useState(me?.statusText ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (me) {
      setCharacter(me.character); setCharacterColor(me.characterColor);
      setStatusEmoji(me.statusEmoji); setStatusText(me.statusText ?? "");
    }
  }, [me]);

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/team-workspace", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character, characterColor, statusEmoji, statusText }),
      });
      onUpdate();
      setOpen(false);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button variant="outline" className="gap-1.5 h-9 px-3" />
      }>
        <Sparkles size={13} /> Customize Me
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Customize your character</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Preview */}
          <div className="flex items-center justify-center py-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200">
            <div className="relative">
              <div
                className="h-16 w-16 rounded-2xl flex items-center justify-center text-4xl shadow-lg ring-2 ring-white"
                style={{ background: `linear-gradient(135deg, ${characterColor} 0%, ${characterColor}aa 100%)` }}
              >
                {characterEmoji(character)}
              </div>
              {statusEmoji && (
                <span className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white shadow-sm ring-1 ring-gray-200 flex items-center justify-center text-sm">
                  {statusEmoji}
                </span>
              )}
            </div>
          </div>

          {/* Character */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Character</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {CHARACTERS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCharacter(c.key)}
                  title={c.label}
                  className={cn(
                    "h-10 rounded-lg flex items-center justify-center text-xl border transition-all",
                    character === c.key
                      ? "bg-[#99ff33]/15 border-[#99ff33] scale-105"
                      : "bg-white border-gray-200 hover:bg-gray-50"
                  )}
                >
                  {c.emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Color</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={characterColor} onChange={(e) => setCharacterColor(e.target.value)} className="h-9 w-16 cursor-pointer rounded-md" />
              <span className="text-xs font-mono text-gray-500">{characterColor}</span>
              <div className="ml-auto flex gap-1">
                {["#99ff33", "#3b82f6", "#ec4899", "#f97316", "#8b5cf6", "#10b981"].map((c) => (
                  <button key={c} onClick={() => setCharacterColor(c)}
                    className="h-5 w-5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Status</Label>
            <div className="flex items-center gap-2">
              <Select value={statusEmoji} onValueChange={(v) => v && setStatusEmoji(v)}>
                <SelectTrigger className="w-16"><SelectValue>{statusEmoji}</SelectValue></SelectTrigger>
                <SelectContent>
                  {STATUS_EMOJIS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input value={statusText} onChange={(e) => setStatusText(e.target.value)} placeholder="What are you working on?" maxLength={40} />
            </div>
          </div>

          <Button onClick={save} className="w-full btn-brand" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Quick assign-task dialog ─────────────────────────────────────────────────

function AssignTaskDialog({ member, open, onOpenChange, onCreated }: {
  member: Member | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [projects, setProjects] = useState<{ id: string; name: string; color: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();

  useEffect(() => {
    if (open) {
      fetch("/api/projects?limit=200")
        .then((r) => r.json())
        .then((d) => {
          setProjects(d.projects || []);
          if (d.projects?.[0] && !projectId) setProjectId(d.projects[0].id);
        });
    }
  }, [open, projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !member || !projectId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, projectId, assigneeId: member.userId,
          dueDate: dueDate || null, priority,
        }),
      });
      if (res.ok) {
        success({ title: `Task assigned to ${member.name}` });
        onCreated();
        onOpenChange(false);
        setTitle(""); setDueDate("");
      } else error({ title: "Failed to assign" });
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Assign task {member && <span className="text-gray-400 font-normal">to {member.name}</span>}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">What needs done?</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" autoFocus required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Project</Label>
              <Select value={projectId} onValueChange={(v) => v && setProjectId(v)}>
                <SelectTrigger>
                  <SelectValue>
                    {projects.find((p) => p.id === projectId)?.name ?? "—"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Due</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Priority</Label>
            <div className="flex gap-1">
              {(["low", "medium", "high", "urgent"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cn(
                    "flex-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors capitalize",
                    priority === p
                      ? p === "urgent" ? "bg-red-50 text-red-700 border-red-200"
                      : p === "high" ? "bg-orange-50 text-orange-700 border-orange-200"
                      : p === "medium" ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-slate-50 text-slate-700 border-slate-200"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full btn-brand" disabled={saving || !title.trim() || !projectId}>
            {saving ? "Assigning…" : "Assign & notify"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

// F-47 (audit-random-bug-fix): My Team used to land directly in a pixel-art
// office grid. The audit reasonably objected — the office is fun but it
// hides the actual operational view (who's online, who has open tasks). We
// now default to a "list" view that surfaces real data; the office stays as
// an opt-in toggle. Preference is persisted in localStorage so a user who
// likes the office isn't reset on every visit.
type TeamView = "list" | "office";
const TEAM_VIEW_STORAGE_KEY = "team-view-mode";

export default function TeamPage() {
  const { success } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Member | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [view, setView] = useState<TeamView>("list");

  // Restore persisted view preference on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(TEAM_VIEW_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot localStorage hydration on mount; matches the pattern other pages use for restoring preferences
    if (saved === "list" || saved === "office") setView(saved);
  }, []);

  function toggleView(next: TeamView) {
    setView(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TEAM_VIEW_STORAGE_KEY, next);
    }
  }

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team-workspace");
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const me = members.find((m) => m.isMe) ?? null;

  // Build a map of position → member
  const posMap = new Map<string, Member>();
  for (const m of members) posMap.set(`${m.x},${m.y}`, m);

  async function moveMe(x: number, y: number) {
    if (!me) return;
    // Don't move onto walls or another member
    const layoutCell = OFFICE_LAYOUT[y]?.[x];
    if (!layoutCell || layoutCell === "W") return;
    const occupied = posMap.get(`${x},${y}`);
    if (occupied && !occupied.isMe) return;

    // Optimistic
    setMembers((prev) => prev.map((m) => (m.isMe ? { ...m, x, y } : m)));
    await fetch("/api/team-workspace", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x, y }),
    });
  }

  async function pingMember(member: Member) {
    success({ title: `Ping sent to ${member.name}`, description: "They'll get a notification" });
    // Note: full notification system would post to /api/notifications
  }

  return (
    <div className="flex flex-col h-full min-h-0 animate-fade-in bg-gray-50">
      {/* ── Sticky header ── */}
      <div className="glass-strong sticky top-0 z-10 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Users2 size={18} className="text-[#2d5200]" />
              My Team
            </h1>
            <p className="text-xs text-gray-500">
              {members.length} {members.length === 1 ? "member" : "members"} ·{" "}
              {members.filter((m) => m.isOnline).length} online ·{" "}
              <span className="text-[#2d5200] font-semibold">
                {members.reduce((s, m) => s + m.openTasks, 0)} open tasks
              </span>
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* F-47: view-mode toggle (list = default, office = opt-in) */}
            <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => toggleView("list")}
                className={cn(
                  "h-7 px-2.5 rounded-md flex items-center gap-1.5 text-xs transition-colors",
                  view === "list"
                    ? "bg-[#99ff33]/15 text-[#2d5200] font-semibold"
                    : "text-gray-500 hover:text-gray-800"
                )}
                aria-pressed={view === "list"}
                aria-label="Switch to list view"
              >
                <List size={12} /> List
              </button>
              <button
                type="button"
                onClick={() => toggleView("office")}
                className={cn(
                  "h-7 px-2.5 rounded-md flex items-center gap-1.5 text-xs transition-colors",
                  view === "office"
                    ? "bg-[#99ff33]/15 text-[#2d5200] font-semibold"
                    : "text-gray-500 hover:text-gray-800"
                )}
                aria-pressed={view === "office"}
                aria-label="Switch to office view"
              >
                <LayoutGrid size={12} /> Office
              </button>
            </div>
            <MySettingsDialog me={me} onUpdate={fetchMembers} />
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          {view === "office"
            ? "Click empty floor cells to move your character · click a teammate to see their tasks · use the "
            : "Click a teammate to see their open tasks · use the "}
          <span className="font-semibold">Customize Me</span> button to change avatar
        </p>
      </div>

      {/* ── List view (F-47 default) ── */}
      {view === "list" && (
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {loading ? (
            <div className="max-w-3xl mx-auto space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="max-w-3xl mx-auto py-16 text-center text-sm text-gray-400">
              No team members yet.
            </div>
          ) : (
            <ul className="max-w-3xl mx-auto bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
              {members.map((m) => (
                <li
                  key={m.userId}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer",
                    m.isMe && "bg-[#99ff33]/5"
                  )}
                  onClick={() => setSelected(m)}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      "relative h-10 w-10 rounded-xl flex items-center justify-center text-xl shrink-0 ring-2 ring-white shadow-sm",
                      m.isMe && "ring-[#99ff33]"
                    )}
                    style={{
                      background: `linear-gradient(135deg, ${m.characterColor} 0%, ${m.characterColor}aa 100%)`,
                    }}
                  >
                    <span className="leading-none">{characterEmoji(m.character)}</span>
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white",
                        m.isOnline ? "bg-green-500" : "bg-gray-300"
                      )}
                    />
                  </div>
                  {/* Identity + status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {m.name}
                        {m.isMe && (
                          <span className="ml-2 text-[10px] uppercase tracking-wider text-[#2d5200] font-bold">
                            You
                          </span>
                        )}
                      </p>
                      {m.statusEmoji && (
                        <span className="text-xs">{m.statusEmoji}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">
                      {m.statusText || m.email}
                    </p>
                  </div>
                  {/* Tasks badge */}
                  <div className="text-right shrink-0">
                    <div
                      className={cn(
                        "text-sm font-bold tabular-nums",
                        m.openTasks > 0 ? "text-gray-900" : "text-gray-400"
                      )}
                    >
                      {m.openTasks}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-400">
                      open
                    </div>
                  </div>
                  {/* Online dot label */}
                  <span
                    className={cn(
                      "shrink-0 text-[10px] uppercase tracking-wider font-semibold w-12 text-right",
                      m.isOnline ? "text-green-600" : "text-gray-400"
                    )}
                  >
                    {m.isOnline ? "Online" : "Away"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Office grid (F-47: opt-in) ── */}
      {view === "office" && (
      <div className="flex-1 overflow-auto flex items-center justify-center p-8">
        {loading ? (
          <div className="h-96 w-96 rounded-2xl bg-gray-100 animate-pulse" />
        ) : (
          <div
            className="relative inline-block rounded-2xl overflow-hidden shadow-[0_20px_60px_rgb(0_0_0/0.15)] ring-1 ring-gray-300 bg-amber-50"
            style={{
              width: GRID_COLS * CELL_SIZE,
              height: GRID_ROWS * CELL_SIZE,
              backgroundImage: `
                radial-gradient(circle at 50% 50%, rgb(254 243 199 / 0.5) 0%, transparent 60%),
                repeating-linear-gradient(90deg, rgb(180 83 9 / 0.04) 0px, rgb(180 83 9 / 0.04) 2px, transparent 2px, transparent ${CELL_SIZE}px),
                repeating-linear-gradient(0deg, rgb(180 83 9 / 0.04) 0px, rgb(180 83 9 / 0.04) 2px, transparent 2px, transparent ${CELL_SIZE}px)
              `,
            }}
          >
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${GRID_COLS}, ${CELL_SIZE}px)`,
                gridTemplateRows: `repeat(${GRID_ROWS}, ${CELL_SIZE}px)`,
              }}
            >
              {OFFICE_LAYOUT.map((row, y) =>
                row.split("").map((cell, x) => {
                  const member = posMap.get(`${x},${y}`);
                  return (
                    <OfficeCell
                      key={`${x}-${y}`}
                      type={cell}
                      member={member}
                      isMine={member?.isMe}
                      onClick={() => moveMe(x, y)}
                      onMemberClick={() => setSelected(member!)}
                    />
                  );
                })
              )}
            </div>

            {/* Office signage */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#0d1a00] text-[#99ff33] text-[10px] font-bold tracking-wider uppercase shadow-lg">
              ⚡ Edge Point HQ
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── Legend ── */}
      <div className="border-t border-gray-200 bg-white px-6 py-3 flex items-center gap-4 text-[11px] text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" /> Online
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-gray-400" /> Away
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-500 text-[7px] text-white flex items-center justify-center font-bold">3</span> Open tasks
        </div>
        <div className="ml-auto text-gray-400">
          Total team capacity: {members.length * 5} task slots
        </div>
      </div>

      {/* ── Member side panel ── */}
      {selected && (
        <MemberPanel
          member={selected}
          onClose={() => setSelected(null)}
          onAssign={() => setAssignOpen(true)}
          onPing={() => pingMember(selected)}
        />
      )}

      {/* ── Assign task dialog ── */}
      <AssignTaskDialog
        member={selected}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        onCreated={fetchMembers}
      />
    </div>
  );
}
