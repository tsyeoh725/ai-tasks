"use client";

import { useEffect, useState } from "react";
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

type ChainStep = {
  id?: string;
  taskTitle: string;
  taskDescription?: string;
  trigger: string;
  delayHours: number;
  action: string;
  sortOrder: number;
};

type Chain = {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  steps: ChainStep[];
  runs: { id: string; status: string; startedAt: string }[];
};

const TRIGGER_LABELS: Record<string, string> = {
  completed: "When completed",
  approved: "When approved",
  manual: "Manually triggered",
};

const ACTION_LABELS: Record<string, string> = {
  create_task: "Create next task",
  notify: "Send notification",
  upload_to_drive: "Upload to Drive",
  ai_verify_drive: "AI verify in Drive",
};

const EXAMPLE_CHAINS = [
  {
    name: "Client Onboarding Flow",
    description: "Full onboarding from kickoff to first deliverables",
    steps: [
      { taskTitle: "Client Kickoff Call", trigger: "completed", delayHours: 0, action: "create_task", sortOrder: 0 },
      { taskTitle: "First Batch Ideation", trigger: "completed", delayHours: 24, action: "create_task", sortOrder: 1 },
      { taskTitle: "Client Approval Round 1", trigger: "approved", delayHours: 0, action: "create_task", sortOrder: 2 },
      { taskTitle: "Schedule Filming / Production", trigger: "completed", delayHours: 0, action: "create_task", sortOrder: 3 },
      { taskTitle: "Upload Raw Files to Google Drive", trigger: "completed", delayHours: 0, action: "upload_to_drive", sortOrder: 4 },
      { taskTitle: "AI Verify Files in Client Drive", trigger: "completed", delayHours: 0, action: "ai_verify_drive", sortOrder: 5 },
    ],
  },
  {
    name: "Social Media Campaign",
    description: "Ideation → content creation → approval → publish",
    steps: [
      { taskTitle: "Content Ideation", trigger: "completed", delayHours: 0, action: "create_task", sortOrder: 0 },
      { taskTitle: "Copywriting & Design", trigger: "completed", delayHours: 0, action: "create_task", sortOrder: 1 },
      { taskTitle: "Client Review", trigger: "approved", delayHours: 0, action: "create_task", sortOrder: 2 },
      { taskTitle: "Schedule & Publish", trigger: "completed", delayHours: 0, action: "create_task", sortOrder: 3 },
      { taskTitle: "Performance Report", trigger: "completed", delayHours: 168, action: "notify", sortOrder: 4 },
    ],
  },
];

export function ProjectWorkflowsPanel({ projectId }: { projectId: string }) {
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<ChainStep[]>([
    { taskTitle: "", trigger: "completed", delayHours: 0, action: "create_task", sortOrder: 0 },
  ]);

  async function fetchChains() {
    try {
      const res = await fetch(`/api/projects/${projectId}/workflows`);
      if (res.ok) setChains(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchChains(); }, [projectId]);

  function loadExample(ex: typeof EXAMPLE_CHAINS[0]) {
    setName(ex.name);
    setDescription(ex.description);
    setSteps(ex.steps.map((s) => ({ ...s, taskDescription: "" })));
  }

  function addStep() {
    setSteps((prev) => [...prev, { taskTitle: "", trigger: "completed", delayHours: 0, action: "create_task", sortOrder: prev.length }]);
  }

  function updateStep(idx: number, patch: Partial<ChainStep>) {
    setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sortOrder: i })));
  }

  async function handleCreate() {
    if (!name.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || null, steps }),
    });
    if (res.ok) { setCreating(false); setName(""); setDescription(""); setSteps([{ taskTitle: "", trigger: "completed", delayHours: 0, action: "create_task", sortOrder: 0 }]); fetchChains(); }
  }

  async function handleStart(chainId: string) {
    await fetch(`/api/projects/${projectId}/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "_start", steps: [], startNow: false }),
    });
    // Actually start via a dedicated start endpoint would be better, but for now we just indicate the run
    fetchChains();
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Workflow Chains</h2>
          <p className="text-sm text-muted-foreground">Chain tasks so that completing one auto-creates the next.</p>
        </div>
        <Button onClick={() => setCreating(!creating)}>{creating ? "Cancel" : "New Chain"}</Button>
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Workflow Chain</CardTitle>
            <div className="flex gap-2 flex-wrap mt-1">
              {EXAMPLE_CHAINS.map((ex) => (
                <button key={ex.name} onClick={() => loadExample(ex)}
                  className="text-xs px-2 py-1 rounded border hover:bg-accent text-muted-foreground">
                  Load: {ex.name}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Chain Name *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Client Onboarding Flow" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What does this workflow accomplish?" />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Steps</label>
              <div className="space-y-3">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex gap-2 p-3 rounded-lg border bg-muted/30 flex-wrap items-end">
                    <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 self-center">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <label className="text-xs text-muted-foreground">Task Title</label>
                      <Input value={step.taskTitle} onChange={(e) => updateStep(idx, { taskTitle: e.target.value })} placeholder="Task name" className="h-8" />
                    </div>
                    <div className="w-36">
                      <label className="text-xs text-muted-foreground">Trigger</label>
                      <Select value={step.trigger} onValueChange={(v) => v && updateStep(idx, { trigger: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(TRIGGER_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-36">
                      <label className="text-xs text-muted-foreground">Action</label>
                      <Select value={step.action} onValueChange={(v) => v && updateStep(idx, { action: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(ACTION_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24">
                      <label className="text-xs text-muted-foreground">Delay (hrs)</label>
                      <Input type="number" value={step.delayHours} onChange={(e) => updateStep(idx, { delayHours: parseInt(e.target.value) || 0 })} className="h-8" min={0} />
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive h-8 shrink-0" onClick={() => removeStep(idx)}>×</Button>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={addStep} className="mt-2">+ Add Step</Button>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreate}>Create Chain</Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {chains.length === 0 && !creating && (
        <div className="text-center py-12 text-muted-foreground">No workflow chains yet. Create one to automate your task flow.</div>
      )}

      <div className="space-y-3">
        {chains.map((chain) => (
          <Card key={chain.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{chain.name}</h3>
                    <Badge variant={chain.isActive ? "default" : "secondary"} className="text-xs">
                      {chain.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {chain.description && <p className="text-sm text-muted-foreground mt-0.5">{chain.description}</p>}
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    {chain.steps.sort((a, b) => a.sortOrder - b.sortOrder).map((step, idx) => (
                      <span key={idx} className="flex items-center gap-1">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted border">{step.taskTitle || `Step ${idx + 1}`}</span>
                        {idx < chain.steps.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
                      </span>
                    ))}
                  </div>
                  {chain.runs.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {chain.runs.length} run{chain.runs.length > 1 ? "s" : ""} · Latest: {chain.runs[0].status}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
