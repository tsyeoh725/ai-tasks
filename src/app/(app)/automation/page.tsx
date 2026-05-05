"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Settings as SettingsIcon,
  XCircle,
} from "lucide-react";

const ACTION_OPTIONS = ["pause", "kill", "boost_budget", "duplicate"] as const;
type ActionOpt = (typeof ACTION_OPTIONS)[number];

type BrandRow = {
  brandId: string;
  brandName: string;
  isActive: boolean;
  enabled: boolean;
  cadenceHours: number;
  autoApproveMinConfidence: number;
  autoApproveActions: string[];
  lastCycleAt: string | null;
};

type CycleStep = {
  step: string;
  status: "queued" | "running" | "succeeded" | "failed" | "skipped";
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: unknown;
};

type Cycle = {
  cycleId: string;
  brandId: string;
  brandName: string;
  trigger: "scheduled" | "manual";
  createdAt: string;
  steps: CycleStep[];
};

type PromptResponse = {
  template: string;
  defaultTemplate: string;
  variables: Array<{ name: string; description: string }>;
  isDefault: boolean;
  updatedAt: string | null;
};

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function stepBadge(step: CycleStep) {
  const tone = {
    succeeded: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    skipped: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
    running: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    queued: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  }[step.status];
  return (
    <span className={cn("text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium", tone)}>
      {step.step} · {step.status}
    </span>
  );
}

export default function AutomationPage() {
  const [brandsList, setBrandsList] = useState<BrandRow[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [prompt, setPrompt] = useState<PromptResponse | null>(null);
  const [promptDraft, setPromptDraft] = useState<string>("");
  const [globalPause, setGlobalPause] = useState<boolean>(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (opts: { showSpinner?: boolean } = {}) => {
    if (opts.showSpinner !== false) setLoading(true);
    try {
      const [settingsRes, cyclesRes, promptRes, marketingRes] = await Promise.all([
        fetch("/api/automation/settings"),
        fetch("/api/automation/cycles?limit=20"),
        fetch("/api/automation/system-prompt"),
        fetch("/api/marketing/settings"),
      ]);
      if (settingsRes.ok) {
        const data = (await settingsRes.json()) as { brands: BrandRow[] };
        setBrandsList(data.brands);
      }
      if (cyclesRes.ok) {
        const data = (await cyclesRes.json()) as { cycles: Cycle[] };
        setCycles(data.cycles);
      }
      if (promptRes.ok) {
        const data = (await promptRes.json()) as PromptResponse;
        setPrompt(data);
        setPromptDraft((prev) => (prev === "" || prev === undefined ? data.template : prev));
      }
      if (marketingRes.ok) {
        const data = (await marketingRes.json()) as { settings: Record<string, unknown> };
        const gp = data.settings?.global_pause;
        if (typeof gp === "boolean") setGlobalPause(gp);
      }
    } catch {}
    if (opts.showSpinner !== false) setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch + interval poll
    void fetchAll();
    const interval = setInterval(() => {
      if (!document.hidden) void fetchAll({ showSpinner: false });
    }, 15_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const summary = useMemo(() => {
    const enabled = brandsList.filter((b) => b.enabled).length;
    const total = brandsList.length;
    const recentFailures = cycles.filter((c) =>
      c.steps.some((s) => s.status === "failed"),
    ).length;
    return { enabled, total, recentFailures };
  }, [brandsList, cycles]);

  async function patchBrand(brandId: string, patch: Partial<BrandRow>) {
    const optimistic = brandsList.map((b) =>
      b.brandId === brandId ? { ...b, ...patch } : b,
    );
    setBrandsList(optimistic);
    try {
      const res = await fetch("/api/automation/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, ...patch }),
      });
      if (!res.ok) {
        setStatus("Failed to save — reverting");
        await fetchAll({ showSpinner: false });
      }
    } catch {
      setStatus("Network error — reverting");
      await fetchAll({ showSpinner: false });
    }
  }

  async function toggleAction(brandId: string, action: ActionOpt) {
    const brand = brandsList.find((b) => b.brandId === brandId);
    if (!brand) return;
    const next = brand.autoApproveActions.includes(action)
      ? brand.autoApproveActions.filter((a) => a !== action)
      : [...brand.autoApproveActions, action];
    await patchBrand(brandId, { autoApproveActions: next });
  }

  async function handleRunNow(brandId: string) {
    if (running.has(brandId)) return;
    setRunning((prev) => new Set(prev).add(brandId));
    setStatus(null);
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      if (res.ok || res.status === 202) {
        setStatus("Cycle queued — watch the status badge.");
      } else {
        setStatus("Failed to queue cycle");
      }
    } catch {
      setStatus("Failed to queue cycle");
    }
    setRunning((prev) => {
      const next = new Set(prev);
      next.delete(brandId);
      return next;
    });
  }

  async function handleGlobalPause(next: boolean) {
    setGlobalPause(next);
    try {
      await fetch("/api/marketing/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global_pause: next }),
      });
    } catch {
      setGlobalPause(!next);
      setStatus("Failed to toggle pause");
    }
  }

  async function handleSavePrompt() {
    setSavingPrompt(true);
    setStatus(null);
    try {
      const res = await fetch("/api/automation/system-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: promptDraft }),
      });
      if (res.ok) {
        setStatus("System prompt saved");
        await fetchAll({ showSpinner: false });
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus(`Save failed — ${data?.error || "unknown error"}`);
      }
    } catch {
      setStatus("Save failed — network error");
    }
    setSavingPrompt(false);
  }

  async function handleResetPrompt() {
    if (!prompt) return;
    setPromptDraft(prompt.defaultTemplate);
  }

  async function handleClearOverride() {
    setSavingPrompt(true);
    try {
      const res = await fetch("/api/automation/system-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: "" }),
      });
      if (res.ok) {
        setStatus("Reverted to default prompt");
        await fetchAll({ showSpinner: false });
        setPromptDraft(prompt?.defaultTemplate ?? "");
      }
    } catch {}
    setSavingPrompt(false);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-5 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Automation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Sync → Audit → Journal → AI Memory → Approval — running unattended for the brands you toggle on.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-600 text-right">
            <div>{summary.enabled}/{summary.total} brands on auto-pilot</div>
            {summary.recentFailures > 0 && (
              <div className="text-red-600 mt-0.5">
                {summary.recentFailures} cycle{summary.recentFailures === 1 ? "" : "s"} with failures
              </div>
            )}
          </div>
          <Button
            variant={globalPause ? "destructive" : "outline"}
            size="sm"
            onClick={() => handleGlobalPause(!globalPause)}
          >
            {globalPause ? <Play /> : <Pause />}
            {globalPause ? "Resume all" : "Pause all"}
          </Button>
        </div>
      </div>

      {status && (
        <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
          {status}
        </div>
      )}

      {/* Pipeline reference: explains what runs in a cycle. Static graphic
          since the actual run-by-run state lives in the cycles list below. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Pipeline
          </CardTitle>
          <CardDescription>What a cycle does, in order</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {[
              { key: "sync", label: "1. Sync", desc: "Pull fresh Meta data" },
              { key: "audit", label: "2. Audit", desc: "Compare KPIs to thresholds → recommendations" },
              { key: "memory", label: "3. AI memory", desc: "Inject brand remarks + history into the prompt" },
              { key: "guard", label: "4. AI Guard", desc: "Verdict + confidence + risk" },
              { key: "approve", label: "5. Execute", desc: "Auto-run if allowed; else send to /approvals" },
            ].map((s, i, arr) => (
              <div key={s.key} className="flex items-center gap-2">
                <div className="rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-white/10 px-2.5 py-1.5">
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{s.label}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">{s.desc}</div>
                </div>
                {i < arr.length - 1 && <span className="text-slate-300">→</span>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Per-brand auto-pilot table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <SettingsIcon className="w-4 h-4" />
            Per-brand auto-pilot
          </CardTitle>
          <CardDescription>
            Each brand gets its own cadence + auto-approve rules. Disabled brands still produce approvals — they just never auto-execute.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-lg bg-gray-50 border border-gray-200 animate-pulse" />
              ))}
            </div>
          ) : brandsList.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No brands in this workspace yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
                    <th className="px-2 py-2 font-medium">Brand</th>
                    <th className="px-2 py-2 font-medium">Auto-pilot</th>
                    <th className="px-2 py-2 font-medium">Cadence</th>
                    <th className="px-2 py-2 font-medium">Min confidence</th>
                    <th className="px-2 py-2 font-medium">Auto-approve actions</th>
                    <th className="px-2 py-2 font-medium">Last cycle</th>
                    <th className="px-2 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {brandsList.map((b) => (
                    <tr key={b.brandId} className="align-middle">
                      <td className="px-2 py-2.5">
                        <div className="font-medium text-slate-900">{b.brandName}</div>
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          onClick={() => patchBrand(b.brandId, { enabled: !b.enabled })}
                          className={cn(
                            "h-5 w-9 rounded-full relative transition-colors",
                            b.enabled ? "bg-emerald-500" : "bg-slate-300",
                          )}
                          aria-pressed={b.enabled}
                          aria-label={`Toggle auto-pilot for ${b.brandName}`}
                        >
                          <span
                            className={cn(
                              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                              b.enabled ? "left-4" : "left-0.5",
                            )}
                          />
                        </button>
                      </td>
                      <td className="px-2 py-2.5">
                        <select
                          value={b.cadenceHours}
                          onChange={(e) => patchBrand(b.brandId, { cadenceHours: Number(e.target.value) })}
                          className="rounded border border-slate-300 px-2 py-1 text-xs"
                        >
                          {[1, 3, 6, 12, 24, 48].map((h) => (
                            <option key={h} value={h}>{h}h</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2.5">
                        <select
                          value={b.autoApproveMinConfidence}
                          onChange={(e) =>
                            patchBrand(b.brandId, { autoApproveMinConfidence: Number(e.target.value) })
                          }
                          className="rounded border border-slate-300 px-2 py-1 text-xs"
                        >
                          {[0.7, 0.75, 0.8, 0.85, 0.9, 0.95].map((c) => (
                            <option key={c} value={c}>≥ {Math.round(c * 100)}%</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {ACTION_OPTIONS.map((a) => {
                            const on = b.autoApproveActions.includes(a);
                            const isSpend = a === "boost_budget" || a === "duplicate";
                            return (
                              <button
                                key={a}
                                type="button"
                                onClick={() => toggleAction(b.brandId, a)}
                                className={cn(
                                  "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border transition-colors",
                                  on
                                    ? isSpend
                                      ? "bg-amber-100 text-amber-800 border-amber-300"
                                      : "bg-emerald-100 text-emerald-800 border-emerald-300"
                                    : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100",
                                )}
                                title={
                                  isSpend
                                    ? "Auto-approving this action moves real spend"
                                    : "Reversible-ish action"
                                }
                              >
                                {a}
                                {isSpend && on && <AlertTriangle className="inline ml-0.5 w-3 h-3" />}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-slate-500">{timeAgo(b.lastCycleAt)}</td>
                      <td className="px-2 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRunNow(b.brandId)}
                          disabled={running.has(b.brandId)}
                        >
                          {running.has(b.brandId) ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <RefreshCw />
                          )}
                          Run now
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* System prompt editor */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">AI Audit system prompt</CardTitle>
          <CardDescription>
            What the AI Guard reads before scoring each recommendation. Edit freely; placeholders below are filled in per-brand at run time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {prompt && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={prompt.isDefault ? "default" : "warning"}>
                  {prompt.isDefault ? "Using default" : "Override active"}
                </Badge>
                {prompt.updatedAt && (
                  <span className="text-[11px] text-slate-500">
                    Last saved {timeAgo(prompt.updatedAt)}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                <div className="font-semibold uppercase tracking-wider text-[10px] text-slate-500 mb-1">
                  Available variables
                </div>
                <ul className="space-y-0.5">
                  {prompt.variables.map((v) => (
                    <li key={v.name}>
                      <code className="text-indigo-700 font-mono">{v.name}</code> — {v.description}
                    </li>
                  ))}
                </ul>
              </div>
              <Label htmlFor="guard-prompt" className="text-xs">Prompt template</Label>
              <textarea
                id="guard-prompt"
                rows={20}
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                disabled={savingPrompt}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono leading-relaxed"
                placeholder={prompt.defaultTemplate}
              />
              {!promptDraft.includes("{{brand_memory}}") && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  <AlertTriangle className="inline w-3 h-3 mr-1" />
                  Heads up: your prompt is missing <code>{`{{brand_memory}}`}</code> — operator remarks won&apos;t reach the AI Guard.
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={handleSavePrompt} disabled={savingPrompt}>
                  {savingPrompt ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={handleResetPrompt} disabled={savingPrompt}>
                  <RotateCcw />
                  Load default
                </Button>
                {!prompt.isDefault && (
                  <Button size="sm" variant="outline" onClick={handleClearOverride} disabled={savingPrompt}>
                    <XCircle />
                    Revert to default
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent cycles */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent cycles</CardTitle>
          <CardDescription>Last 20 sync→audit runs across all brands you can see.</CardDescription>
        </CardHeader>
        <CardContent>
          {cycles.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No cycles yet — toggle a brand on, or click Run now.</p>
          ) : (
            <ul className="space-y-2">
              {cycles.map((c) => (
                <li key={c.cycleId} className="rounded-lg border border-slate-200 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-slate-900 truncate">{c.brandName}</span>
                      <Badge variant="default">{c.trigger}</Badge>
                      <span className="text-[11px] text-slate-500">{timeAgo(c.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {c.steps.map((s) => (
                        <span key={`${c.cycleId}-${s.step}`}>{stepBadge(s)}</span>
                      ))}
                    </div>
                  </div>
                  {c.steps.some((s) => s.error) && (
                    <div className="mt-1.5 text-[11px] text-red-700 break-words">
                      {c.steps.filter((s) => s.error).map((s) => `${s.step}: ${s.error}`).join(" · ")}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
