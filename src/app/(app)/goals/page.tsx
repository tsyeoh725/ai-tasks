"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GOAL_STATUS_LABELS } from "@/lib/labels";
import { useConfirm } from "@/components/ui/confirm-dialog";

type KeyResult = {
  id: string;
  goalId: string;
  title: string;
  targetValue: number;
  currentValue: number;
  unit: string;
};

type GoalLink = {
  id: string;
  goalId: string;
  entityType: "project" | "task";
  entityId: string;
};

type Goal = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  progress: number;
  dueDate: string | null;
  owner: { id: string; name: string } | null;
  keyResults: KeyResult[];
  links: GoalLink[];
};

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-200 text-gray-700",
  on_track: "bg-green-100 text-green-700",
  at_risk: "bg-yellow-100 text-yellow-700",
  off_track: "bg-red-100 text-red-700",
  achieved: "bg-blue-100 text-blue-700",
};

export default function GoalsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());

  // New goal form state
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newType, setNewType] = useState("goal");
  const [newDueDate, setNewDueDate] = useState("");

  // Inline KR editing
  const [editingKR, setEditingKR] = useState<string | null>(null);
  const [editKRValue, setEditKRValue] = useState("");

  // New KR form
  const [addingKRGoalId, setAddingKRGoalId] = useState<string | null>(null);
  const [newKRTitle, setNewKRTitle] = useState("");
  const [newKRTarget, setNewKRTarget] = useState("100");
  const [newKRUnit, setNewKRUnit] = useState("%");

  async function fetchGoals() {
    try {
      const res = await fetch("/api/goals");
      const data = await res.json();
      setGoals(data.goals || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchGoals();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        type: newType,
        dueDate: newDueDate || null,
      }),
    });

    if (res.ok) {
      setNewTitle("");
      setNewDescription("");
      setNewType("goal");
      setNewDueDate("");
      setCreating(false);
      fetchGoals();
    }
  }

  async function handleStatusChange(goalId: string, status: string) {
    await fetch(`/api/goals/${goalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchGoals();
  }

  async function handleDelete(goalId: string) {
    const ok = await confirm({
      title: "Delete goal?",
      description: "This will also remove all its key results. This cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
    fetchGoals();
  }

  function toggleExpand(goalId: string) {
    setExpandedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) {
        next.delete(goalId);
      } else {
        next.add(goalId);
      }
      return next;
    });
  }

  async function handleUpdateKRValue(goalId: string, krId: string) {
    const val = parseFloat(editKRValue);
    if (isNaN(val)) return;

    await fetch(`/api/goals/${goalId}/key-results`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyResultId: krId, currentValue: val }),
    });

    setEditingKR(null);
    setEditKRValue("");
    fetchGoals();
  }

  async function handleAddKR(goalId: string) {
    if (!newKRTitle.trim()) return;

    await fetch(`/api/goals/${goalId}/key-results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newKRTitle.trim(),
        targetValue: parseFloat(newKRTarget) || 100,
        unit: newKRUnit || "%",
      }),
    });

    setAddingKRGoalId(null);
    setNewKRTitle("");
    setNewKRTarget("100");
    setNewKRUnit("%");
    fetchGoals();
  }

  async function handleDeleteKR(goalId: string, krId: string) {
    const ok = await confirm({
      title: "Delete key result?",
      description: "Its progress data will be lost.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch(`/api/goals/${goalId}/key-results`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyResultId: krId }),
    });
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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Goals &amp; OKRs</h1>
        <Button onClick={() => setCreating(!creating)}>
          {creating ? "Cancel" : "New Goal"}
        </Button>
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>Create Goal</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Goal title"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium">Type</label>
                  <Select
                    value={newType}
                    onValueChange={(v: string | null) => v && setNewType(v)}
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {newType === "objective" ? "Objective" : "Goal"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="goal">Goal</SelectItem>
                      <SelectItem value="objective">Objective</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium">Due Date</label>
                  <Input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit">Create Goal</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {goals.length === 0 && !creating && (
        <div className="text-center py-12 text-muted-foreground">
          No goals yet. Create one to get started.
        </div>
      )}

      <div className="space-y-4">
        {goals.map((goal) => {
          const isExpanded = expandedGoals.has(goal.id);
          return (
            <Card key={goal.id} className="group">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        onClick={() => toggleExpand(goal.id)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? "\u25BC" : "\u25B6"}
                      </button>
                      <h3 className="font-semibold text-lg truncate">
                        {goal.title}
                      </h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[goal.status] || "bg-gray-200 text-gray-700"}`}
                      >
                        {GOAL_STATUS_LABELS[goal.status] || goal.status}
                      </span>
                    </div>

                    {goal.description && (
                      <p className="text-sm text-muted-foreground mb-2 ml-6">
                        {goal.description}
                      </p>
                    )}

                    <div className="ml-6 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.min(goal.progress, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground w-12 text-right">
                          {goal.progress}%
                        </span>
                      </div>
                    </div>

                    <div className="ml-6 flex items-center gap-4 text-xs text-muted-foreground">
                      {goal.owner && <span>Owner: {goal.owner.name}</span>}
                      {goal.dueDate && (
                        <span>
                          Due:{" "}
                          {new Date(goal.dueDate).toLocaleDateString()}
                        </span>
                      )}
                      {goal.links.length > 0 && (
                        <span>
                          {goal.links.length} linked{" "}
                          {goal.links.length === 1 ? "item" : "items"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={goal.status}
                      onValueChange={(v: string | null) =>
                        v && handleStatusChange(goal.id, v)
                      }
                    >
                      <SelectTrigger className="w-[130px] h-8 text-xs">
                        <SelectValue>
                          {GOAL_STATUS_LABELS[goal.status] || goal.status}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_started">
                          {GOAL_STATUS_LABELS.not_started}
                        </SelectItem>
                        <SelectItem value="on_track">
                          {GOAL_STATUS_LABELS.on_track}
                        </SelectItem>
                        <SelectItem value="at_risk">
                          {GOAL_STATUS_LABELS.at_risk}
                        </SelectItem>
                        <SelectItem value="off_track">
                          {GOAL_STATUS_LABELS.off_track}
                        </SelectItem>
                        <SelectItem value="achieved">
                          {GOAL_STATUS_LABELS.achieved}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={() => handleDelete(goal.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 ml-6 space-y-3 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">Key Results</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setAddingKRGoalId(
                            addingKRGoalId === goal.id ? null : goal.id
                          )
                        }
                      >
                        {addingKRGoalId === goal.id
                          ? "Cancel"
                          : "Add Key Result"}
                      </Button>
                    </div>

                    {addingKRGoalId === goal.id && (
                      <div className="flex items-end gap-2 p-3 bg-muted/50 rounded-md">
                        <div className="flex-1">
                          <label className="text-xs font-medium">Title</label>
                          <Input
                            value={newKRTitle}
                            onChange={(e) => setNewKRTitle(e.target.value)}
                            placeholder="Key result title"
                            className="h-8"
                          />
                        </div>
                        <div className="w-20">
                          <label className="text-xs font-medium">Target</label>
                          <Input
                            value={newKRTarget}
                            onChange={(e) => setNewKRTarget(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <div className="w-16">
                          <label className="text-xs font-medium">Unit</label>
                          <Input
                            value={newKRUnit}
                            onChange={(e) => setNewKRUnit(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleAddKR(goal.id)}
                        >
                          Add
                        </Button>
                      </div>
                    )}

                    {goal.keyResults.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No key results yet.
                      </p>
                    )}

                    {goal.keyResults.map((kr) => {
                      const krProgress =
                        kr.targetValue > 0
                          ? Math.round(
                              (kr.currentValue / kr.targetValue) * 100
                            )
                          : 0;
                      return (
                        <div
                          key={kr.id}
                          className="flex items-center gap-3 group/kr"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm truncate">
                                {kr.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary/70 rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(krProgress, 100)}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground w-10 text-right">
                                {krProgress}%
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 text-sm shrink-0">
                            {editingKR === kr.id ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  handleUpdateKRValue(goal.id, kr.id);
                                }}
                                className="flex items-center gap-1"
                              >
                                <Input
                                  value={editKRValue}
                                  onChange={(e) =>
                                    setEditKRValue(e.target.value)
                                  }
                                  className="w-16 h-6 text-xs"
                                  autoFocus
                                  onBlur={() =>
                                    handleUpdateKRValue(goal.id, kr.id)
                                  }
                                />
                                <span className="text-muted-foreground">
                                  / {kr.targetValue} {kr.unit}
                                </span>
                              </form>
                            ) : (
                              <>
                                <button
                                  className="hover:bg-muted px-1 rounded cursor-pointer"
                                  onClick={() => {
                                    setEditingKR(kr.id);
                                    setEditKRValue(
                                      String(kr.currentValue)
                                    );
                                  }}
                                >
                                  {kr.currentValue}
                                </button>
                                <span className="text-muted-foreground">
                                  / {kr.targetValue} {kr.unit}
                                </span>
                              </>
                            )}
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover/kr:opacity-100 text-destructive h-6 w-6 p-0"
                            onClick={() => handleDeleteKR(goal.id, kr.id)}
                          >
                            x
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
