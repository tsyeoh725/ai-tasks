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
  spendLimit?: {
    monthlyLimit: number | null;
    dailyLimit: number | null;
    alertThreshold: number;
    pauseOnLimit: boolean;
  };
};

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
    setStatus({ kind: "info", message: "Resyncing data from Meta..." });
    try {
      const res = await fetch("/api/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: id }),
      });
      if (res.ok) {
        setStatus({ kind: "success", message: "Resync complete" });
      } else {
        setStatus({ kind: "error", message: "Resync failed" });
      }
    } catch {
      setStatus({ kind: "error", message: "Resync failed" });
    }
    setSyncing(false);
  }

  async function handlePullAll() {
    setPulling(true);
    setStatus({ kind: "info", message: "Pulling full history..." });
    try {
      const res = await fetch("/api/meta/pull-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: id }),
      });
      if (res.ok) {
        setStatus({ kind: "success", message: "Historical pull complete" });
      } else {
        setStatus({ kind: "error", message: "Historical pull failed" });
      }
    } catch {
      setStatus({ kind: "error", message: "Historical pull failed" });
    }
    setPulling(false);
  }

  async function handleRunMonitor() {
    setRunning(true);
    setStatus({ kind: "info", message: "Running monitor..." });
    try {
      const res = await fetch(`/api/cron/monitor?brandId=${id}`, {
        method: "POST",
      });
      if (res.ok) {
        setStatus({ kind: "success", message: "Monitor run complete" });
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
            status.kind === "success"
              ? "text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 rounded-lg px-3 py-2"
              : status.kind === "error"
                ? "text-xs text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2"
                : "text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2"
          }
        >
          {status.message}
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
          <Button onClick={handleResync} disabled={syncing} variant="outline">
            {syncing ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Resync data
          </Button>
          <Button onClick={handlePullAll} disabled={pulling} variant="outline">
            {pulling ? <Loader2 className="animate-spin" /> : <Database />}
            Full historical pull
          </Button>
          <Button onClick={handleRunMonitor} disabled={running} variant="outline">
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            Run monitor now
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
