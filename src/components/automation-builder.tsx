"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, Zap, ZapOff, ChevronDown, ChevronUp, Sparkles } from "lucide-react";

type TriggerType = "status_changed" | "task_created" | "due_date_passed" | "assigned" | "priority_changed";
type ActionType =
  | "set_status"
  | "set_priority"
  | "assign"
  | "add_comment"
  | "notify"
  | "ai_summarise"
  | "ai_triage"
  | "ai_rewrite";

const AI_ACTION_TYPES: ActionType[] = ["ai_summarise", "ai_triage", "ai_rewrite"];

type Trigger = {
  type: TriggerType;
  conditions?: Record<string, string>;
};

type Action = {
  type: ActionType;
  params: Record<string, string>;
};

type Rule = {
  id: string;
  name: string;
  description?: string;
  trigger: Trigger;
  actions: Action[];
  enabled: boolean;
};

const TRIGGER_LABELS: Record<TriggerType, string> = {
  status_changed: "Status Changed",
  task_created: "Task Created",
  due_date_passed: "Due Date Passed",
  assigned: "Task Assigned",
  priority_changed: "Priority Changed",
};

const ACTION_LABELS: Record<ActionType, string> = {
  set_status: "Set Status",
  set_priority: "Set Priority",
  assign: "Assign To",
  add_comment: "Add Comment",
  notify: "Send Notification",
  ai_summarise: "AI Summarise Comments",
  ai_triage: "AI Triage Priority",
  ai_rewrite: "AI Rewrite Title & Description",
};

const STATUSES = ["todo", "in_progress", "done", "blocked"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

function describeTrigger(trigger: Trigger): string {
  let desc = TRIGGER_LABELS[trigger.type];
  if (trigger.conditions) {
    const parts = Object.entries(trigger.conditions).map(
      ([k, v]) => `${k}: ${v}`
    );
    if (parts.length > 0) desc += ` (${parts.join(", ")})`;
  }
  return desc;
}

function describeAction(action: Action): string {
  const label = ACTION_LABELS[action.type];
  const paramStr = Object.entries(action.params)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  return paramStr ? `${label} (${paramStr})` : label;
}

export function AutomationBuilder({ projectId }: { projectId: string }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  // Builder state
  const [newName, setNewName] = useState("");
  const [newTriggerType, setNewTriggerType] = useState<TriggerType>("status_changed");
  const [newConditions, setNewConditions] = useState<Record<string, string>>({});
  const [newActions, setNewActions] = useState<Action[]>([
    { type: "set_status", params: { status: "done" } },
  ]);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch(`/api/automations?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules);
      }
    } catch (error) {
      console.error("Failed to fetch rules:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    await fetch(`/api/automations/${ruleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled } : r))
    );
  };

  const deleteRule = async (ruleId: string) => {
    await fetch(`/api/automations/${ruleId}`, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
  };

  const saveRule = async () => {
    if (!newName.trim()) return;

    const trigger: Trigger = { type: newTriggerType };
    if (Object.keys(newConditions).length > 0) {
      trigger.conditions = newConditions;
    }

    const res = await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        name: newName.trim(),
        trigger,
        actions: newActions,
      }),
    });

    if (res.ok) {
      const rule = await res.json();
      setRules((prev) => [rule, ...prev]);
      resetBuilder();
    }
  };

  const resetBuilder = () => {
    setShowBuilder(false);
    setNewName("");
    setNewTriggerType("status_changed");
    setNewConditions({});
    setNewActions([{ type: "set_status", params: { status: "done" } }]);
  };

  const updateActionType = (index: number, type: ActionType) => {
    setNewActions((prev) => {
      const updated = [...prev];
      const defaultParams: Record<ActionType, Record<string, string>> = {
        set_status: { status: "done" },
        set_priority: { priority: "high" },
        assign: { userId: "" },
        add_comment: { message: "" },
        notify: { userId: "", title: "", message: "" },
        ai_summarise: {},
        ai_triage: {},
        ai_rewrite: {},
      };
      updated[index] = { type, params: defaultParams[type] };
      return updated;
    });
  };

  const updateActionParam = (index: number, key: string, value: string) => {
    setNewActions((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        params: { ...updated[index].params, [key]: value },
      };
      return updated;
    });
  };

  const addAction = () => {
    setNewActions((prev) => [...prev, { type: "set_status", params: { status: "done" } }]);
  };

  const removeAction = (index: number) => {
    setNewActions((prev) => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground py-4">Loading automation rules...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Automation Rules</h3>
        {!showBuilder && (
          <Button size="sm" variant="outline" onClick={() => setShowBuilder(true)}>
            <Plus className="size-3.5" />
            Add Rule
          </Button>
        )}
      </div>

      {/* Existing rules */}
      {rules.length === 0 && !showBuilder && (
        <p className="text-sm text-muted-foreground py-2">
          No automation rules yet. Create one to automate task workflows.
        </p>
      )}

      <div className="space-y-2">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={`rounded-lg border p-3 transition-colors ${
              rule.enabled
                ? "border-border bg-card"
                : "border-border/50 bg-muted/30 opacity-70"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
                className="flex items-center gap-2 text-left flex-1 min-w-0"
              >
                {rule.enabled ? (
                  <Zap className="size-3.5 text-amber-500 shrink-0" />
                ) : (
                  <ZapOff className="size-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="text-sm font-medium truncate">{rule.name}</span>
                {expandedRule === rule.id ? (
                  <ChevronUp className="size-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                )}
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="xs"
                  variant={rule.enabled ? "secondary" : "outline"}
                  onClick={() => toggleRule(rule.id, !rule.enabled)}
                >
                  {rule.enabled ? "Disable" : "Enable"}
                </Button>
                <Button size="icon-xs" variant="ghost" onClick={() => deleteRule(rule.id)}>
                  <Trash2 className="size-3.5 text-muted-foreground" />
                </Button>
              </div>
            </div>

            {expandedRule === rule.id && (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground border-t pt-2">
                <div>
                  <span className="font-medium text-foreground">When: </span>
                  {describeTrigger(rule.trigger)}
                </div>
                <div>
                  <span className="font-medium text-foreground">Then: </span>
                  {rule.actions.map((a, i) => (
                    <span key={i}>
                      {i > 0 && ", "}
                      {describeAction(a)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Builder */}
      {showBuilder && (
        <div className="rounded-lg border border-primary/30 bg-card p-4 space-y-4">
          <h4 className="text-sm font-medium">New Automation Rule</h4>

          {/* Name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Rule Name</label>
            <Input
              placeholder="e.g. Auto-complete on review"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>

          {/* Trigger */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">When (Trigger)</label>
            <Select
              value={newTriggerType}
              onValueChange={(v) => {
                if (v) {
                  setNewTriggerType(v as TriggerType);
                  setNewConditions({});
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Trigger conditions */}
            {newTriggerType === "status_changed" && (
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">From Status</label>
                  <Select
                    value={newConditions.fromStatus || ""}
                    onValueChange={(v) =>
                      v &&
                      setNewConditions((prev) => ({
                        ...prev,
                        fromStatus: v,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">To Status</label>
                  <Select
                    value={newConditions.toStatus || ""}
                    onValueChange={(v) =>
                      v &&
                      setNewConditions((prev) => ({
                        ...prev,
                        toStatus: v,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {newTriggerType === "priority_changed" && (
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">From Priority</label>
                  <Select
                    value={newConditions.fromPriority || ""}
                    onValueChange={(v) =>
                      v &&
                      setNewConditions((prev) => ({
                        ...prev,
                        fromPriority: v,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">To Priority</label>
                  <Select
                    value={newConditions.toPriority || ""}
                    onValueChange={(v) =>
                      v &&
                      setNewConditions((prev) => ({
                        ...prev,
                        toPriority: v,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {newTriggerType === "assigned" && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">User ID (optional)</label>
                <Input
                  placeholder="Leave empty for any assignee"
                  value={newConditions.userId || ""}
                  onChange={(e) =>
                    setNewConditions((prev) => ({
                      ...prev,
                      userId: e.target.value,
                    }))
                  }
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Then (Actions)</label>
              <Button size="xs" variant="ghost" onClick={addAction}>
                <Plus className="size-3" />
                Add Action
              </Button>
            </div>

            {newActions.map((action, index) => (
              <div key={index} className="rounded border bg-muted/30 p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Select
                      value={action.type}
                      onValueChange={(v) => v && updateActionType(index, v as ActionType)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ACTION_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            <span className="flex items-center gap-2">
                              {AI_ACTION_TYPES.includes(value as ActionType) && (
                                <Sparkles className="size-3.5 text-amber-500" />
                              )}
                              {label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {newActions.length > 1 && (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => removeAction(index)}
                    >
                      <Trash2 className="size-3 text-muted-foreground" />
                    </Button>
                  )}
                </div>

                {/* Action params */}
                {action.type === "set_status" && (
                  <Select
                    value={action.params.status || ""}
                    onValueChange={(v) => v && updateActionParam(index, "status", v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {action.type === "set_priority" && (
                  <Select
                    value={action.params.priority || ""}
                    onValueChange={(v) => v && updateActionParam(index, "priority", v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {action.type === "assign" && (
                  <Input
                    placeholder="User ID"
                    value={action.params.userId || ""}
                    onChange={(e) => updateActionParam(index, "userId", e.target.value)}
                  />
                )}

                {action.type === "add_comment" && (
                  <Input
                    placeholder="Comment message"
                    value={action.params.message || ""}
                    onChange={(e) => updateActionParam(index, "message", e.target.value)}
                  />
                )}

                {action.type === "notify" && (
                  <div className="space-y-2">
                    <Input
                      placeholder="User ID to notify"
                      value={action.params.userId || ""}
                      onChange={(e) => updateActionParam(index, "userId", e.target.value)}
                    />
                    <Input
                      placeholder="Notification title"
                      value={action.params.title || ""}
                      onChange={(e) => updateActionParam(index, "title", e.target.value)}
                    />
                    <Input
                      placeholder="Message (optional)"
                      value={action.params.message || ""}
                      onChange={(e) => updateActionParam(index, "message", e.target.value)}
                    />
                  </div>
                )}

                {AI_ACTION_TYPES.includes(action.type) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="size-3 text-amber-500" />
                    {action.type === "ai_summarise" && "AI will summarise the task's comments and add a new AI comment."}
                    {action.type === "ai_triage" && "AI will infer priority from the description and update the task."}
                    {action.type === "ai_rewrite" && "AI will rewrite the title and description to be clearer."}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Save / Cancel */}
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={resetBuilder}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveRule} disabled={!newName.trim()}>
              Save Rule
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
