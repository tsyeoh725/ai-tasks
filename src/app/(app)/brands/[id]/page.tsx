"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Loader2,
  RefreshCw,
  Database,
  Play,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TILE_METRICS,
  type TileMetricKey,
  resolveTileMetrics,
} from "@/lib/marketing/tile-metrics";
import { cn } from "@/lib/utils";

type BrandConfig = {
  thresholds: {
    cplMax: number | null;
    ctrMin: number | null;
    frequencyMax: number | null;
  };
  toggles: {
    killEnabled: boolean;
    budgetEnabled: boolean;
    duplicateEnabled: boolean;
  };
  preferences: string[];
  insightsDateRange: number;
  costMetric?: { label: string; actionType: string };
  /**
   * Up to 4 metric keys (from tile-metrics registry) to render on each ad
   * tile in the Ads tab. When unset, sensible defaults inferred from the
   * brand's costMetric.actionType are used.
   */
  tileMetrics?: string[];
  spendLimit?: {
    monthlyLimit: number | null;
    dailyLimit: number | null;
    alertThreshold: number;
    pauseOnLimit: boolean;
  };
};

const MAX_TILE_METRICS = 4;

type Brand = {
  id: string;
  name: string;
  metaAccountId: string;
  config: BrandConfig;
  isActive: boolean;
  projectId?: string | null;
};

const defaultSpendLimit = {
  monthlyLimit: null,
  dailyLimit: null,
  alertThreshold: 80,
  pauseOnLimit: false,
};

// Cost metric presets — what counts as a "conversion" for this brand.
// `actionType` matches Meta Insights' `actions[i].action_type` field; the
// sync code aggregates per-ad spend / sum(actions where type === actionType)
// to compute cost-per-action.
const COST_METRIC_PRESETS: Array<{
  key: string;
  label: string;
  longLabel: string;
  actionType: string;
  description: string;
}> = [
  { key: "lead", label: "CPL", longLabel: "Cost per Lead", actionType: "lead",
    description: "Lead-gen / form-fill campaigns" },
  { key: "purchase", label: "CPP", longLabel: "Cost per Purchase", actionType: "purchase",
    description: "Sales / conversion campaigns (uses purchase events)" },
  { key: "omni_purchase", label: "CPP (omni)", longLabel: "Cost per Omni Purchase",
    actionType: "omni_purchase",
    description: "Sales / conversions across all surfaces (web + app + offline)" },
  { key: "messaging", label: "CPMC", longLabel: "Cost per Messaging Conversation",
    actionType: "onsite_conversion.messaging_conversation_started_7d",
    description: "Click-to-Messenger / WhatsApp / Instagram DM campaigns" },
  { key: "link_click", label: "CPC", longLabel: "Cost per Link Click",
    actionType: "link_click",
    description: "Traffic campaigns" },
  { key: "landing_page_view", label: "CPLPV", longLabel: "Cost per Landing Page View",
    actionType: "landing_page_view",
    description: "Traffic with pixel-confirmed page loads" },
  { key: "add_to_cart", label: "CPATC", longLabel: "Cost per Add-to-Cart",
    actionType: "add_to_cart",
    description: "Mid-funnel ecommerce" },
  { key: "initiate_checkout", label: "CPIC", longLabel: "Cost per Initiate Checkout",
    actionType: "initiate_checkout",
    description: "Bottom-funnel ecommerce" },
  { key: "video_view", label: "CPV", longLabel: "Cost per Video View",
    actionType: "video_view",
    description: "Video / awareness campaigns" },
  { key: "custom", label: "Custom", longLabel: "Custom action type", actionType: "",
    description: "Enter your own Meta Insights action_type below" },
];

type SyncSummary = {
  campaigns?: number;
  adSets?: number;
  ads?: number;
  chunksTotal?: number;
  chunksSucceeded?: number;
  chunksFailed?: number;
  failedChunks?: Array<{ since: string; until: string; error: string }>;
};

function formatSyncSummary(label: string, s: SyncSummary | undefined): string {
  if (!s) return `${label} complete`;
  const counts = `${s.campaigns ?? 0} campaigns, ${s.adSets ?? 0} ad sets, ${s.ads ?? 0} ads`;
  if (s.chunksTotal && s.chunksTotal > 1) {
    if (s.chunksFailed && s.chunksFailed > 0) {
      const ranges = (s.failedChunks ?? [])
        .slice(0, 3)
        .map((c) => `${c.since}…${c.until}`)
        .join(", ");
      const more = (s.failedChunks?.length ?? 0) > 3 ? ` (+${(s.failedChunks?.length ?? 0) - 3} more)` : "";
      return `${label} partial — ${s.chunksSucceeded}/${s.chunksTotal} chunks succeeded; ${counts}. Failed ranges: ${ranges}${more}`;
    }
    return `${label} complete — all ${s.chunksTotal} chunks (${counts})`;
  }
  return `${label} complete — ${counts}`;
}

function presetForActionType(actionType: string | undefined) {
  if (!actionType) return COST_METRIC_PRESETS[0];
  return (
    COST_METRIC_PRESETS.find((p) => p.actionType === actionType) ??
    COST_METRIC_PRESETS[COST_METRIC_PRESETS.length - 1] // → "custom"
  );
}

type Status = { kind: "idle" } | { kind: "info"; message: string } | { kind: "success"; message: string } | { kind: "error"; message: string };

export default function BrandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [brand, setBrand] = useState<Brand | null>(null);
  const [config, setConfig] = useState<BrandConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [running, setRunning] = useState(false);
  const [newPref, setNewPref] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/brands");
        const data = await res.json();
        const list: Brand[] = Array.isArray(data) ? data : data.brands || [];
        const found = list.find((b) => b.id === id);
        if (found) {
          setBrand(found);
          setConfig({
            ...found.config,
            spendLimit: found.config?.spendLimit || defaultSpendLimit,
          });
        }
      } catch {
        // noop
      }
    }
    load();
  }, [id]);

  async function handleSave() {
    if (!config || !brand) return;
    setSaving(true);
    setStatus({ kind: "idle" });

    try {
      const res = await fetch(`/api/brands/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });

      if (res.ok) {
        setBrand({ ...brand, config });
        setStatus({ kind: "success", message: "Settings saved" });
      } else {
        setStatus({ kind: "error", message: "Failed to save settings" });
      }
    } catch {
      setStatus({ kind: "error", message: "Failed to save settings" });
    }
    setSaving(false);
  }

  async function handleResync() {
    setSyncing(true);
    setStatus({ kind: "info", message: "Queueing resync…" });
    try {
      const res = await fetch("/api/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok || res.status === 202) {
        setStatus({
          kind: "success",
          message: "Resync queued — running in the background, watch the status badge.",
        });
      } else {
        setStatus({
          kind: "error",
          message: data?.hint
            ? `${data.error || "Resync failed"} — ${data.hint}`
            : data?.error || "Resync failed",
        });
      }
    } catch {
      setStatus({ kind: "error", message: "Resync failed (network error)" });
    }
    setSyncing(false);
  }

  async function handlePullAll() {
    setPulling(true);
    setStatus({ kind: "info", message: "Connecting to Meta…" });

    let chunksTotal = 0;
    let chunksDone = 0;
    let chunksFailed = 0;

    try {
      const res = await fetch("/api/meta/pull-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: id }),
      });

      // Non-streaming error responses (auth / token-missing) come back as
      // a single JSON object with `error` + optional `hint`. Detect via
      // Content-Type — if it's not ndjson, parse once and bail.
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("ndjson")) {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus({
            kind: "error",
            message: data?.hint
              ? `${data.error || "Historical pull failed"} — ${data.hint}`
              : data?.error || "Historical pull failed",
          });
        }
        setPulling(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(trimmed);
          } catch {
            continue;
          }
          switch (event.type) {
            case "ping": {
              // Keep-alive heartbeat from the server — no UI update needed.
              break;
            }
            case "plan": {
              chunksTotal = (event.chunks as number) ?? 0;
              setStatus({
                kind: "info",
                message: `Plan: ${event.campaigns} campaigns, ${event.adSets} ad sets, ${chunksTotal} insight chunks (${event.costActionType}). Pulling chunk 1/${chunksTotal}…`,
              });
              break;
            }
            case "chunk": {
              if (event.phase === "start") {
                setStatus({
                  kind: "info",
                  message: `Chunk ${(event.index as number) + 1}/${event.total}: ${event.since} → ${event.until} (${chunksFailed > 0 ? `${chunksFailed} failed so far` : "all good"})`,
                });
              } else if (event.phase === "end") {
                chunksDone += 1;
                if (event.ok === false) chunksFailed += 1;
                const next = (event.index as number) + 2;
                if (next <= (event.total as number)) {
                  setStatus({
                    kind: "info",
                    message: `Done ${chunksDone}/${event.total}${chunksFailed ? ` (${chunksFailed} failed)` : ""}. Up next: chunk ${next}/${event.total}…`,
                  });
                }
              }
              break;
            }
            case "persist": {
              setStatus({
                kind: "info",
                message: `Writing ${event.ads} ads + ${event.dailyRows} daily-insight rows to the database…`,
              });
              break;
            }
            case "complete": {
              const synced = event.synced as SyncSummary;
              setStatus({
                kind: synced?.chunksFailed ? "info" : "success",
                message: formatSyncSummary("Historical pull", synced),
              });
              break;
            }
            case "error": {
              setStatus({
                kind: "error",
                message: `Historical pull failed — ${event.error}`,
              });
              break;
            }
          }
        }
      }
    } catch (err) {
      setStatus({
        kind: "error",
        message: `Historical pull failed (${err instanceof Error ? err.message : "network error"})`,
      });
    }
    setPulling(false);
  }

  async function handleRunMonitor() {
    setRunning(true);
    setStatus({ kind: "info", message: "Queueing monitor run…" });
    try {
      const res = await fetch(`/api/cron/monitor?brandId=${id}`, {
        method: "POST",
      });
      if (res.ok || res.status === 202) {
        setStatus({
          kind: "success",
          message: "Monitor queued — running in the background, watch the status badge.",
        });
      } else {
        setStatus({ kind: "error", message: "Monitor run failed" });
      }
    } catch {
      setStatus({ kind: "error", message: "Monitor run failed" });
    }
    setRunning(false);
  }

  function addPreference() {
    if (!config || !newPref.trim()) return;
    setConfig({
      ...config,
      preferences: [...config.preferences, newPref.trim()],
    });
    setNewPref("");
  }

  function removePreference(index: number) {
    if (!config) return;
    setConfig({
      ...config,
      preferences: config.preferences.filter((_, i) => i !== index),
    });
  }

  if (!brand || !config) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-6 animate-fade-in">
        <div className="h-8 w-64 bg-gray-100 animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-gray-50 border border-gray-200 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const spendLimit = config.spendLimit || defaultSpendLimit;

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/brands">
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                {brand.name}
              </h1>
              <Badge variant={brand.isActive ? "success" : "secondary"}>
                {brand.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-gray-500 font-mono">
                {brand.metaAccountId}
              </span>
              {brand.projectId && (
                <Link
                  href={`/projects/${brand.projectId}`}
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Linked project
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="primary"
            size="sm"
          >
            {saving ? (
              <>
                <Loader2 className="animate-spin" />
                Saving
              </>
            ) : (
              <>
                <Save />
                Save
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Status banner */}
      {status.kind !== "idle" && (
        <div
          className={
            "text-sm rounded-lg px-3 py-2.5 flex items-center gap-2 " +
            (status.kind === "success"
              ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
              : status.kind === "error"
                ? "text-red-700 bg-red-50 border border-red-200"
                : "text-indigo-700 bg-indigo-50 border border-indigo-200 animate-pulse")
          }
          role="status"
          aria-live="polite"
        >
          {status.kind === "info" && <Loader2 size={14} className="animate-spin shrink-0" />}
          <span>{status.message}</span>
        </div>
      )}

      {/* Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle>Thresholds</CardTitle>
          <p className="text-xs text-gray-500">
            Performance boundaries. Leave empty to skip that metric.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          {/* Cost metric — what counts as a conversion for this brand */}
          {(() => {
            const current = presetForActionType(config.costMetric?.actionType);
            const isCustom = current.key === "custom";
            return (
              <div className="space-y-1.5">
                <Label>Cost metric</Label>
                <Select
                  value={current.key}
                  onValueChange={(key) => {
                    const preset = COST_METRIC_PRESETS.find((p) => p.key === key)!;
                    setConfig({
                      ...config,
                      costMetric: {
                        label: preset.label,
                        actionType: preset.actionType || (config.costMetric?.actionType ?? ""),
                      },
                    });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_METRIC_PRESETS.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.longLabel} ({p.label})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">{current.description}</p>
                {isCustom && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <Label className="text-xs">Short label</Label>
                      <Input
                        value={config.costMetric?.label ?? ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            costMetric: {
                              label: e.target.value,
                              actionType: config.costMetric?.actionType ?? "",
                            },
                          })
                        }
                        placeholder="e.g., CPP"
                        className="mt-1 font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Meta action_type</Label>
                      <Input
                        value={config.costMetric?.actionType ?? ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            costMetric: {
                              label: config.costMetric?.label ?? "",
                              actionType: e.target.value,
                            },
                          })
                        }
                        placeholder="e.g., offsite_conversion.fb_pixel_purchase"
                        className="mt-1 font-mono text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div>
            <Label>{config.costMetric?.label || "CPL"} Maximum (RM)</Label>
            <Input
              type="number"
              step="0.01"
              value={config.thresholds.cplMax ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  thresholds: {
                    ...config.thresholds,
                    cplMax: e.target.value ? parseFloat(e.target.value) : null,
                  },
                })
              }
              placeholder="e.g., 50"
              className="mt-1.5 font-mono"
            />
          </div>
          <div>
            <Label>CTR Minimum (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={config.thresholds.ctrMin ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  thresholds: {
                    ...config.thresholds,
                    ctrMin: e.target.value ? parseFloat(e.target.value) : null,
                  },
                })
              }
              placeholder="e.g., 1.0"
              className="mt-1.5 font-mono"
            />
          </div>
          <div>
            <Label>Frequency Maximum</Label>
            <Input
              type="number"
              step="0.1"
              value={config.thresholds.frequencyMax ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  thresholds: {
                    ...config.thresholds,
                    frequencyMax: e.target.value
                      ? parseFloat(e.target.value)
                      : null,
                  },
                })
              }
              placeholder="e.g., 3.0"
              className="mt-1.5 font-mono"
            />
          </div>
        </CardContent>
      </Card>

      {/* Ads tab tile metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Ads tab tile metrics</CardTitle>
          <p className="text-xs text-gray-500">
            Pick up to {MAX_TILE_METRICS} metrics to show on each ad tile in
            the Ads tab. The order you click is the order they appear.
          </p>
        </CardHeader>
        <CardContent>
          {(() => {
            // F-76: in the picker we read the explicit array directly so
            // an empty selection stays empty. resolveTileMetrics() is
            // still the right call at *render time* on the ads page —
            // there an empty list should fall back to inferred defaults
            // so tiles aren't blank — but here, treating `[]` as "fall
            // back to defaults" made the picker snap the three default
            // chips back on whenever the user tried to deselect them
            // all. `tileMetrics === undefined` still means inferred
            // (i.e. the user hasn't customised), `[]` now means
            // explicitly cleared.
            const isExplicit = config.tileMetrics !== undefined;
            const selected: TileMetricKey[] = isExplicit
              ? (config.tileMetrics as TileMetricKey[])
              : resolveTileMetrics(undefined, config.costMetric?.actionType);
            const toggle = (key: TileMetricKey) => {
              const next = (() => {
                if (selected.includes(key)) {
                  return selected.filter((k) => k !== key);
                }
                if (selected.length >= MAX_TILE_METRICS) return selected;
                return [...selected, key];
              })();
              setConfig({ ...config, tileMetrics: next });
            };
            return (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {TILE_METRICS.map((m) => {
                    const idx = selected.indexOf(m.key);
                    const active = idx !== -1;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => toggle(m.key)}
                        title={m.description}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                          active
                            ? "bg-[#99ff33]/10 border-[#99ff33]/60 text-gray-900 dark:text-white"
                            : "bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10",
                        )}
                      >
                        {active && (
                          <span className="text-[10px] font-mono tabular-nums text-gray-500 dark:text-gray-400">
                            {idx + 1}
                          </span>
                        )}
                        {m.defaultLabel}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>
                    {selected.length}/{MAX_TILE_METRICS} selected
                    {!isExplicit && (
                      <span className="ml-2 text-gray-400">
                        (using inferred defaults)
                      </span>
                    )}
                  </span>
                  {isExplicit && (
                    <button
                      type="button"
                      onClick={() =>
                        setConfig({ ...config, tileMetrics: undefined })
                      }
                      className="text-indigo-600 dark:text-indigo-300 hover:underline"
                    >
                      reset to defaults
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Automation Toggles */}
      <Card>
        <CardHeader>
          <CardTitle>Automation Toggles</CardTitle>
          <p className="text-xs text-gray-500">
            Control which actions the system can take automatically
          </p>
        </CardHeader>
        <CardContent className="space-y-4 max-w-lg">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Kill / Pause Ads</Label>
              <p className="text-xs text-gray-500 mt-0.5">
                Automatically pause or kill underperforming ads
              </p>
            </div>
            <Switch
              checked={config.toggles.killEnabled}
              onCheckedChange={(checked) =>
                setConfig({
                  ...config,
                  toggles: { ...config.toggles, killEnabled: checked },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Budget Reallocation</Label>
              <p className="text-xs text-gray-500 mt-0.5">
                Shift budget from losers to winners
              </p>
            </div>
            <Switch
              checked={config.toggles.budgetEnabled}
              onCheckedChange={(checked) =>
                setConfig({
                  ...config,
                  toggles: { ...config.toggles, budgetEnabled: checked },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Duplicate Winners</Label>
              <p className="text-xs text-gray-500 mt-0.5">
                Copy top-performing ads to new ad sets
              </p>
            </div>
            <Switch
              checked={config.toggles.duplicateEnabled}
              onCheckedChange={(checked) =>
                setConfig({
                  ...config,
                  toggles: { ...config.toggles, duplicateEnabled: checked },
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Spend Limits */}
      <Card>
        <CardHeader>
          <CardTitle>Spend Limits</CardTitle>
          <p className="text-xs text-gray-500">
            Set maximum spend limits. When limits are reached, the system can
            alert you or auto-pause.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div>
            <Label>Monthly Spend Limit (RM)</Label>
            <Input
              type="number"
              step="100"
              value={spendLimit.monthlyLimit ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  spendLimit: {
                    ...spendLimit,
                    monthlyLimit: e.target.value
                      ? parseFloat(e.target.value)
                      : null,
                  },
                })
              }
              placeholder="e.g., 5000"
              className="mt-1.5 font-mono"
            />
          </div>
          <div>
            <Label>Daily Spend Limit (RM)</Label>
            <Input
              type="number"
              step="10"
              value={spendLimit.dailyLimit ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  spendLimit: {
                    ...spendLimit,
                    dailyLimit: e.target.value
                      ? parseFloat(e.target.value)
                      : null,
                  },
                })
              }
              placeholder="e.g., 200"
              className="mt-1.5 font-mono"
            />
          </div>
          <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-200">
            <div>
              <Label>Auto-Pause on Limit</Label>
              <p className="text-xs text-gray-500 mt-0.5">
                Pause all campaigns when monthly limit is reached
              </p>
            </div>
            <Switch
              checked={spendLimit.pauseOnLimit}
              onCheckedChange={(checked) =>
                setConfig({
                  ...config,
                  spendLimit: { ...spendLimit, pauseOnLimit: checked },
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <p className="text-xs text-gray-500">
            Free-form notes for the AI to consider when making decisions
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.preferences.length > 0 && (
            <div className="space-y-2">
              {config.preferences.map((pref, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 border border-gray-200 text-sm"
                >
                  <span className="flex-1">{pref}</span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => removePreference(i)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              value={newPref}
              onChange={(e) => setNewPref(e.target.value)}
              placeholder='e.g., "Be more aggressive on CPL during holiday promos"'
              className="text-sm"
              rows={2}
            />
            <Button onClick={addPreference} variant="outline" className="shrink-0">
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <p className="text-xs text-gray-500">
            Manual data operations for this brand
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={handleResync} disabled={syncing || pulling || running} variant="outline">
            {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {syncing ? "Resyncing…" : "Resync data"}
          </Button>
          <Button onClick={handlePullAll} disabled={syncing || pulling || running} variant="outline">
            {pulling ? <Loader2 className="animate-spin" /> : <Database />}
            {pulling ? "Pulling history…" : "Full historical pull"}
          </Button>
          <Button onClick={handleRunMonitor} disabled={syncing || pulling || running} variant="outline">
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            {running ? "Running monitor…" : "Run monitor now"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
