"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
  Info,
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

// action → corresponding brand-level toggle key in BrandConfig.toggles.
// kill + pause both ride on killEnabled (matches core-monitor's mapping).
const ACTION_TOGGLE: Record<ActionOpt, keyof BrandToggles> = {
  pause: "killEnabled",
  kill: "killEnabled",
  boost_budget: "budgetEnabled",
  duplicate: "duplicateEnabled",
};

type BrandToggles = {
  killEnabled: boolean;
  budgetEnabled: boolean;
  duplicateEnabled: boolean;
};

type BrandRow = {
  brandId: string;
  brandName: string;
  isActive: boolean;
  enabled: boolean;
  cadenceHours: number;
  autoApproveMinConfidence: number;
  autoApproveActions: string[];
  lastCycleAt: string | null;
  brandToggles: BrandToggles;
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

type PromptSection = {
  kind: "audit" | "confidence" | "health";
  label: string;
  description: string;
  template: string;
  defaultTemplate: string;
  isDefault: boolean;
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
  const [prompts, setPrompts] = useState<PromptSection[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activePromptKind, setActivePromptKind] = useState<PromptSection["kind"]>("audit");
  const [globalPause, setGlobalPause] = useState<boolean>(false);
  const [savingKind, setSavingKind] = useState<string | null>(null);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (opts: { showSpinner?: boolean } = {}) => {
    if (opts.showSpinner !== false) setLoading(true);
    try {
      const [settingsRes, cyclesRes, promptsRes, marketingRes] = await Promise.all([
        fetch("/api/automation/settings"),
        fetch("/api/automation/cycles?limit=20"),
        fetch("/api/automation/prompts"),
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
      if (promptsRes.ok) {
        const data = (await promptsRes.json()) as { prompts: PromptSection[] };
        setPrompts(data.prompts);
        // Seed drafts only if a draft for that kind hasn't been touched.
        setDrafts((prev) => {
          const next = { ...prev };
          for (const p of data.prompts) {
            if (next[p.kind] === undefined) next[p.kind] = p.template;
          }
          return next;
        });
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

  async function handleSavePrompt(kind: PromptSection["kind"]) {
    setSavingKind(kind);
    setStatus(null);
    try {
      const res = await fetch("/api/automation/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, template: drafts[kind] ?? "" }),
      });
      if (res.ok) {
        setStatus(`Saved ${kind} prompt`);
        await fetchAll({ showSpinner: false });
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus(`Save failed — ${data?.error || "unknown error"}`);
      }
    } catch {
      setStatus("Save failed — network error");
    }
    setSavingKind(null);
  }

  function handleLoadDefault(kind: PromptSection["kind"]) {
    const p = prompts.find((pp) => pp.kind === kind);
    if (!p) return;
    setDrafts((prev) => ({ ...prev, [kind]: p.defaultTemplate }));
  }

  async function handleClearOverride(kind: PromptSection["kind"]) {
    setSavingKind(kind);
    try {
      const res = await fetch("/api/automation/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, template: "" }),
      });
      if (res.ok) {
        setStatus(`Reverted ${kind} prompt to default`);
        const p = prompts.find((pp) => pp.kind === kind);
        if (p) setDrafts((prev) => ({ ...prev, [kind]: p.defaultTemplate }));
        await fetchAll({ showSpinner: false });
      }
    } catch {}
    setSavingKind(null);
  }

  const activePrompt = prompts.find((p) => p.kind === activePromptKind);
  const activeDraft = drafts[activePromptKind] ?? activePrompt?.template ?? "";

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

      {/* Pipeline reference */}
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
                  {brandsList.map((b) => {
                    const blockedActions = b.autoApproveActions.filter(
                      (a) => !b.brandToggles[ACTION_TOGGLE[a as ActionOpt]],
                    );
                    return (
                      <Fragment key={b.brandId}>
                        <tr className="align-middle">
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
                                const brandToggleOn = b.brandToggles[ACTION_TOGGLE[a]];
                                const blocked = on && !brandToggleOn;
                                return (
                                  <button
                                    key={a}
                                    type="button"
                                    onClick={() => toggleAction(b.brandId, a)}
                                    className={cn(
                                      "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border transition-colors",
                                      blocked
                                        ? "bg-red-50 text-red-700 border-red-300"
                                        : on
                                          ? isSpend
                                            ? "bg-amber-100 text-amber-800 border-amber-300"
                                            : "bg-emerald-100 text-emerald-800 border-emerald-300"
                                          : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100",
                                    )}
                                    title={
                                      blocked
                                        ? `Brand has ${ACTION_TOGGLE[a]} OFF — turn it on in Brand settings, or this won't auto-execute`
                                        : isSpend
                                          ? "Auto-approving this action moves real spend"
                                          : "Reversible-ish action"
                                    }
                                  >
                                    {a}
                                    {(blocked || (isSpend && on)) && (
                                      <AlertTriangle className="inline ml-0.5 w-3 h-3" />
                                    )}
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
                        {blockedActions.length > 0 && (
                          <tr className="bg-red-50/50">
                            <td colSpan={7} className="px-2 py-1.5 text-[11px] text-red-700">
                              <AlertTriangle className="inline w-3 h-3 mr-1" />
                              {blockedActions.join(", ")} won&apos;t auto-execute — turn on the matching toggle on the{" "}
                              <a
                                href={`/brands/${b.brandId}`}
                                className="underline font-medium hover:text-red-900"
                              >
                                {b.brandName} brand page
                              </a>{" "}
                              first.
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confidence explainer */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4" />
            How the AI assigns confidence
          </CardTitle>
          <CardDescription>What the donut on each approval actually means.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-700 dark:text-slate-200 space-y-2">
          <p>
            Confidence is <strong>not calculated by the system</strong> — it&apos;s a number Claude returns alongside the verdict in the same tool call. The model weighs the recommendation against:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[13px]">
            <li>The brand&apos;s thresholds (CPL/CTR/frequency) and how clearly the data crosses them</li>
            <li>How long the ad has been running and how many impressions it has</li>
            <li>The brand&apos;s memory — past operator remarks and weekly summaries</li>
            <li>The action&apos;s risk class (high/medium/low — set by the Ads health rubric below)</li>
          </ul>
          <p>
            The <strong>Confidence rubric</strong> below tells the model how to map evidence quality to a 0–1 number. The <strong>auto-approve floor</strong> on each brand row gates whether an &quot;approved&quot; verdict actually runs unattended — anything below it falls back to /approvals.
          </p>
          <p className="text-xs text-slate-500">
            Edit the Confidence prompt below to tighten or loosen how aggressive the model is. The default rule says confidence &lt; 0.7 must be &quot;pending&quot; regardless of other signals.
          </p>
        </CardContent>
      </Card>

      {/* Three-section system prompt editor */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">AI Audit prompts</CardTitle>
          <CardDescription>
            Three prompts feed the Guard: how to decide a verdict, how to score confidence, and how to assess risk. Brand-specific data (thresholds, memory) is appended automatically — you don&apos;t need any placeholders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {prompts.length > 0 && (
            <>
              <div className="flex items-center gap-1 border-b border-slate-200 dark:border-white/10">
                {prompts.map((p) => (
                  <button
                    key={p.kind}
                    type="button"
                    onClick={() => setActivePromptKind(p.kind)}
                    className={cn(
                      "px-3 py-1.5 text-sm border-b-2 -mb-px transition-colors",
                      activePromptKind === p.kind
                        ? "border-indigo-500 text-indigo-700 font-medium"
                        : "border-transparent text-slate-500 hover:text-slate-800",
                    )}
                  >
                    {p.label}
                    {!p.isDefault && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wider text-amber-600">
                        edited
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {activePrompt && (
                <>
                  <p className="text-xs text-slate-500">{activePrompt.description}</p>
                  <Label htmlFor={`prompt-${activePromptKind}`} className="text-xs">
                    {activePrompt.label} prompt
                  </Label>
                  <textarea
                    id={`prompt-${activePromptKind}`}
                    rows={20}
                    value={activeDraft}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [activePromptKind]: e.target.value }))
                    }
                    disabled={savingKind === activePromptKind}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono leading-relaxed"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleSavePrompt(activePromptKind)}
                      disabled={savingKind === activePromptKind}
                    >
                      {savingKind === activePromptKind ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLoadDefault(activePromptKind)}
                      disabled={savingKind === activePromptKind}
                    >
                      <RotateCcw />
                      Load default
                    </Button>
                    {!activePrompt.isDefault && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleClearOverride(activePromptKind)}
                        disabled={savingKind === activePromptKind}
                      >
                        <XCircle />
                        Revert to default
                      </Button>
                    )}
                  </div>
                </>
              )}
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
