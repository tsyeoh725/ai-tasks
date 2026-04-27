"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { GOAL_STATUS_LABELS } from "@/lib/labels";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Plus, Target, Trash2 } from "lucide-react";

const GoalsMindMap = lazy(() =>
  import("@/components/goals-mind-map").then((m) => ({ default: m.GoalsMindMap }))
);

type KeyResult = {
  id: string;
  goalId: string;
  title: string;
  targetValue: number;
  currentValue: number;
  unit: string;
};

type Goal = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  progress: number;
  dueDate: string | null;
  startDate: string | null;
  specific: string | null;
  measurable: string | null;
  achievable: string | null;
  relevant: string | null;
  timeBound: string | null;
  parentGoalId: string | null;
  owner: { id: string; name: string } | null;
  keyResults: KeyResult[];
  links: { id: string; entityType: string; entityId: string }[];
};

type View = "cards" | "table" | "mindmap";

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-200 text-gray-700",
  on_track: "bg-green-100 text-green-700",
  at_risk: "bg-yellow-100 text-yellow-700",
  off_track: "bg-red-100 text-red-700",
  achieved: "bg-blue-100 text-blue-700",
};

const COLOR_DOT: Record<string, string> = {
  not_started: "#94a3b8",
  on_track: "#22c55e",
  at_risk: "#f59e0b",
  off_track: "#ef4444",
  achieved: "#3b82f6",
};

// ── SMART Goal Form ──────────────────────────────────────────────
type SmartFormState = {
  title: string; description: string; type: string; dueDate: string; startDate: string;
  specific: string; measurable: string; achievable: string; relevant: string; timeBound: string;
};

function SmartGoalForm({ onSubmit, onCancel }: {
  onSubmit: (data: SmartFormState) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<SmartFormState>({
    title: "", description: "", type: "goal", dueDate: "", startDate: "",
    specific: "", measurable: "", achievable: "", relevant: "", timeBound: "",
  });
  const [tab, setTab] = useState<"basic" | "smart">("basic");
  const [loading, setLoading] = useState(false);

  const smartFields: { key: keyof SmartFormState; label: string; hint: string }[] = [
    { key: "specific", label: "Specific", hint: "What exactly do you want to achieve?" },
    { key: "measurable", label: "Measurable", hint: "How will you measure success?" },
    { key: "achievable", label: "Achievable", hint: "Is this realistic and attainable?" },
    { key: "relevant", label: "Relevant", hint: "Why does this goal matter?" },
    { key: "timeBound", label: "Time-bound", hint: "When do you need to accomplish it?" },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setLoading(true);
    try { await onSubmit(form); } finally { setLoading(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Goal</CardTitle>
        <div className="flex gap-1 mt-1">
          {(["basic", "smart"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-1 rounded text-xs capitalize",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {t === "basic" ? "Basic" : "SMART Framework"}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {tab === "basic" ? (
            <>
              <div>
                <label className="text-sm font-medium">Title *</label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Goal title" required />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" rows={2} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-sm font-medium">Type</label>
                  <Select value={form.type} onValueChange={(v) => v && setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="goal">Goal</SelectItem>
                      <SelectItem value="objective">Objective</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium">Start Date</label>
                  <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium">Due Date</label>
                  <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">The SMART framework helps define clear, achievable goals.</p>
              <div>
                <label className="text-sm font-medium">Title *</label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Goal title" required />
              </div>
              {smartFields.map(({ key, label, hint }) => (
                <div key={key}>
                  <label className="text-sm font-medium">{label}</label>
                  <p className="text-xs text-muted-foreground mb-1">{hint}</p>
                  <Textarea
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    placeholder={hint}
                    rows={2}
                  />
                </div>
              ))}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-sm font-medium">Start Date</label>
                  <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium">Due Date</label>
                  <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={loading}>{loading ? "Creating..." : "Create Goal"}</Button>
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Table View ───────────────────────────────────────────────────
function GoalsTable({ goals, onStatusChange, onDelete }: {
  goals: Goal[];
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {["Goal", "Type", "Status", "Progress", "Due Date", ""].map((h) => (
              <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {goals.map((g) => (
            <tr key={g.id} className="border-b hover:bg-muted/30 group">
              <td className="px-3 py-2">
                <div>
                  <p className="font-medium">{g.title}</p>
                  {g.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{g.description}</p>}
                </div>
              </td>
              <td className="px-3 py-2 capitalize text-muted-foreground">{g.type}</td>
              <td className="px-3 py-2">
                <Select value={g.status} onValueChange={(v) => v && onStatusChange(g.id, v)}>
                  <SelectTrigger className="w-[130px] h-7 text-xs border-0 shadow-none px-0">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs", STATUS_COLORS[g.status])}>
                      {GOAL_STATUS_LABELS[g.status] || g.status}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(GOAL_STATUS_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${g.progress}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{g.progress}%</span>
                </div>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {g.dueDate ? new Date(g.dueDate).toLocaleDateString() : "—"}
              </td>
              <td className="px-3 py-2">
                <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 text-destructive h-7"
                  onClick={() => onDelete(g.id)}>Delete</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Card View ────────────────────────────────────────────────────
function GoalCard({ goal, onStatusChange, onDelete, onAddKR, onUpdateKR, onDeleteKR }: {
  goal: Goal;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onAddKR: (goalId: string, data: { title: string; targetValue: number; unit: string }) => void;
  onUpdateKR: (goalId: string, krId: string, value: number) => void;
  onDeleteKR: (goalId: string, krId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [addingKR, setAddingKR] = useState(false);
  const [editingKR, setEditingKR] = useState<string | null>(null);
  const [editKRValue, setEditKRValue] = useState("");
  const [newKRTitle, setNewKRTitle] = useState("");
  const [newKRTarget, setNewKRTarget] = useState("100");
  const [newKRUnit, setNewKRUnit] = useState("%");
  const [showSmart, setShowSmart] = useState(false);

  const hasSmart = goal.specific || goal.measurable || goal.achievable || goal.relevant || goal.timeBound;

  return (
    <Card className="group">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-2 mb-1 w-full text-left hover:bg-gray-50 rounded -mx-1 px-1 py-0.5 transition-colors group/expand"
            >
              {expanded ? (
                <ChevronDown size={14} className="text-gray-400 shrink-0 group-hover/expand:text-gray-700" />
              ) : (
                <ChevronRight size={14} className="text-gray-400 shrink-0 group-hover/expand:text-gray-700" />
              )}
              <h3 className="font-semibold text-lg truncate">{goal.title}</h3>
              <span className={cn("text-xs px-2 py-0.5 rounded-full shrink-0", STATUS_COLORS[goal.status])}>
                {GOAL_STATUS_LABELS[goal.status] || goal.status}
              </span>
              {goal.keyResults.length > 0 && (
                <span className="ml-1 text-[10px] uppercase tracking-wider text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full font-semibold">
                  {goal.keyResults.length} KR
                </span>
              )}
            </button>
            {goal.description && (
              <p className="text-sm text-muted-foreground mb-2 ml-6">{goal.description}</p>
            )}
            <div className="ml-6 mb-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${goal.progress}%`, backgroundColor: COLOR_DOT[goal.status] }} />
                </div>
                <span className="text-sm text-muted-foreground w-12 text-right">{goal.progress}%</span>
              </div>
            </div>
            <div className="ml-6 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {goal.owner && <span>Owner: {goal.owner.name}</span>}
              {goal.dueDate && <span>Due: {new Date(goal.dueDate).toLocaleDateString()}</span>}
              {hasSmart && (
                <button onClick={() => setShowSmart(!showSmart)} className="text-primary hover:underline">
                  {showSmart ? "Hide SMART" : "View SMART"}
                </button>
              )}
            </div>

            {showSmart && (
              <div className="ml-6 mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  ["Specific", goal.specific],
                  ["Measurable", goal.measurable],
                  ["Achievable", goal.achievable],
                  ["Relevant", goal.relevant],
                  ["Time-bound", goal.timeBound],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label as string} className="p-2 rounded bg-muted/50">
                    <p className="text-xs font-medium text-primary">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select value={goal.status} onValueChange={(v) => v && onStatusChange(goal.id, v)}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue>{GOAL_STATUS_LABELS[goal.status] || goal.status}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(GOAL_STATUS_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 hover:bg-red-50"
              onClick={() => onDelete(goal.id)}
              title="Delete goal"
            >
              <Trash2 size={13} />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 ml-6 space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Key Results</h4>
              <Button variant="outline" size="sm" onClick={() => setAddingKR(!addingKR)}>
                {addingKR ? "Cancel" : "Add Key Result"}
              </Button>
            </div>

            {addingKR && (
              <div className="flex items-end gap-2 p-3 bg-muted/50 rounded-md">
                <div className="flex-1">
                  <label className="text-xs font-medium">Title</label>
                  <Input value={newKRTitle} onChange={(e) => setNewKRTitle(e.target.value)} placeholder="Key result" className="h-8" />
                </div>
                <div className="w-20">
                  <label className="text-xs font-medium">Target</label>
                  <Input value={newKRTarget} onChange={(e) => setNewKRTarget(e.target.value)} className="h-8" />
                </div>
                <div className="w-16">
                  <label className="text-xs font-medium">Unit</label>
                  <Input value={newKRUnit} onChange={(e) => setNewKRUnit(e.target.value)} className="h-8" />
                </div>
                <Button size="sm" onClick={() => {
                  if (!newKRTitle.trim()) return;
                  onAddKR(goal.id, { title: newKRTitle.trim(), targetValue: parseFloat(newKRTarget) || 100, unit: newKRUnit || "%" });
                  setNewKRTitle(""); setNewKRTarget("100"); setNewKRUnit("%"); setAddingKR(false);
                }}>Add</Button>
              </div>
            )}

            {goal.keyResults.length === 0 && !addingKR && (
              <button
                type="button"
                onClick={() => setAddingKR(true)}
                className="w-full rounded-lg border-2 border-dashed border-gray-200 p-4 text-center hover:border-[#99ff33] hover:bg-[#99ff33]/5 transition-all group/empty"
              >
                <Target size={18} className="mx-auto mb-1 text-gray-300 group-hover/empty:text-[#2d5200]" />
                <p className="text-xs font-medium text-gray-700">Add your first Key Result</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Measurable outcomes that prove this goal is met</p>
              </button>
            )}

            {goal.keyResults.map((kr) => {
              const krProgress = kr.targetValue > 0 ? Math.round((kr.currentValue / kr.targetValue) * 100) : 0;
              return (
                <div key={kr.id} className="flex items-center gap-3 group/kr">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm truncate">{kr.title}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary/70 rounded-full" style={{ width: `${Math.min(krProgress, 100)}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-10 text-right">{krProgress}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-sm shrink-0">
                    {editingKR === kr.id ? (
                      <form onSubmit={(e) => { e.preventDefault(); onUpdateKR(goal.id, kr.id, parseFloat(editKRValue)); setEditingKR(null); }}>
                        <Input value={editKRValue} onChange={(e) => setEditKRValue(e.target.value)} className="w-16 h-6 text-xs" autoFocus onBlur={() => { onUpdateKR(goal.id, kr.id, parseFloat(editKRValue)); setEditingKR(null); }} />
                      </form>
                    ) : (
                      <button className="hover:bg-muted px-1 rounded" onClick={() => { setEditingKR(kr.id); setEditKRValue(String(kr.currentValue)); }}>
                        {kr.currentValue}
                      </button>
                    )}
                    <span className="text-muted-foreground">/ {kr.targetValue} {kr.unit}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover/kr:opacity-100 text-destructive h-6 w-6 p-0"
                    onClick={() => onDeleteKR(goal.id, kr.id)}>×</Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function GoalsPage() {
  // useSearchParams must be inside a Suspense boundary for prerender —
  // the inner component holds all hooks; the outer just provides Suspense.
  return (
    <Suspense fallback={null}>
      <GoalsPageContent />
    </Suspense>
  );
}

function GoalsPageContent() {
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<View>("cards");

  async function fetchGoals() {
    try {
      const res = await fetch("/api/goals");
      const data = await res.json();
      setGoals(data.goals || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchGoals(); }, []);

  useEffect(() => {
    if (searchParams.get("new") === "1") setCreating(true);
  }, [searchParams]);

  async function handleCreate(data: SmartFormState) {
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title.trim(),
        description: data.description.trim() || null,
        type: data.type,
        dueDate: data.dueDate || null,
        startDate: data.startDate || null,
        specific: data.specific.trim() || null,
        measurable: data.measurable.trim() || null,
        achievable: data.achievable.trim() || null,
        relevant: data.relevant.trim() || null,
        timeBound: data.timeBound.trim() || null,
      }),
    });
    if (res.ok) { setCreating(false); fetchGoals(); }
  }

  async function handleStatusChange(goalId: string, status: string) {
    await fetch(`/api/goals/${goalId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    fetchGoals();
  }

  async function handleDelete(goalId: string) {
    const ok = await confirm({ title: "Delete goal?", description: "This will also remove all its key results.", confirmLabel: "Delete", variant: "destructive" });
    if (!ok) return;
    await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
    fetchGoals();
  }

  async function handleAddKR(goalId: string, data: { title: string; targetValue: number; unit: string }) {
    await fetch(`/api/goals/${goalId}/key-results`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    fetchGoals();
  }

  async function handleUpdateKR(goalId: string, krId: string, value: number) {
    if (isNaN(value)) return;
    await fetch(`/api/goals/${goalId}/key-results`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyResultId: krId, currentValue: value }) });
    fetchGoals();
  }

  async function handleDeleteKR(goalId: string, krId: string) {
    const ok = await confirm({ title: "Delete key result?", description: "Its progress data will be lost.", confirmLabel: "Delete", variant: "destructive" });
    if (!ok) return;
    await fetch(`/api/goals/${goalId}/key-results`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyResultId: krId }) });
    fetchGoals();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Goals &amp; OKRs</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            {(["cards", "table", "mindmap"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn("px-3 py-1.5 text-sm capitalize", view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {v === "mindmap" ? "Mind Map" : v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <Button onClick={() => setCreating(!creating)}>
            {creating ? "Cancel" : "New Goal"}
          </Button>
        </div>
      </div>

      {creating && <SmartGoalForm onSubmit={handleCreate} onCancel={() => setCreating(false)} />}

      {goals.length === 0 && !creating && (
        <div className="text-center py-12 text-muted-foreground">No goals yet. Create one to get started.</div>
      )}

      {view === "cards" && (
        <div className="space-y-4">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onAddKR={handleAddKR}
              onUpdateKR={handleUpdateKR}
              onDeleteKR={handleDeleteKR}
            />
          ))}
        </div>
      )}

      {view === "table" && goals.length > 0 && (
        <GoalsTable goals={goals} onStatusChange={handleStatusChange} onDelete={handleDelete} />
      )}

      {view === "mindmap" && goals.length > 0 && (
        <Suspense fallback={<div className="h-[600px] flex items-center justify-center text-muted-foreground">Loading mind map…</div>}>
          <GoalsMindMap goals={goals} />
        </Suspense>
      )}
    </div>
  );
}
