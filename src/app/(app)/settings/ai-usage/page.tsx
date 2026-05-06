"use client";

// Admin AI usage view. Reads /api/admin/ai-usage and renders the rolled-up
// shape the API returns. The point of this page is "what spent the most
// tokens" — so the per-call-site table is the primary surface; the rest are
// diagnostic.
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type FeatureTotal = {
  feature: "jarvis" | "audit" | "health_check";
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
};

type CallSiteRow = {
  callSite: string;
  feature: "jarvis" | "audit" | "health_check";
  provider: "anthropic" | "openai";
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
};

type UserRow = {
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

type ModelRow = {
  model: string;
  provider: "anthropic" | "openai";
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  successCount: number;
};

type ErrorRow = {
  id: string;
  feature: string;
  callSite: string;
  provider: string;
  model: string;
  status: "error" | "rate_limited";
  errorMessage: string | null;
  createdAt: string;
};

type DailyRow = { day: string; jarvisCost: number; auditCost: number };

type Payload = {
  rangeDays: number;
  since: string;
  totalsByFeature: FeatureTotal[];
  byCallSite: CallSiteRow[];
  byUser: UserRow[];
  byModel: ModelRow[];
  recentErrors: ErrorRow[];
  daily: DailyRow[];
};

const RANGE_OPTIONS: Array<{ label: string; days: number }> = [
  { label: "Today", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function fmtUsd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function AiUsagePage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ai-usage?days=${days}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const grandCost = data?.totalsByFeature.reduce((sum, t) => sum + t.costUsd, 0) ?? 0;
  const grandCalls = data?.totalsByFeature.reduce((sum, t) => sum + t.calls, 0) ?? 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">AI Usage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Token + cost breakdown across Jarvis, Audit, and health probes. Numbers come from each
            provider&apos;s own usage response — not estimated.
          </p>
        </div>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <Button
              key={opt.days}
              size="sm"
              variant={days === opt.days ? "primary" : "outline"}
              onClick={() => setDays(opt.days)}
            >
              {opt.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-500 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Headline */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryTile label="Total cost" value={fmtUsd(grandCost)} />
        <SummaryTile label="Total calls" value={grandCalls.toLocaleString()} />
        {(["jarvis", "audit"] as const).map((feature) => {
          const t = data?.totalsByFeature.find((x) => x.feature === feature);
          return (
            <SummaryTile
              key={feature}
              label={feature === "jarvis" ? "Jarvis (OpenAI)" : "Audit (Anthropic)"}
              value={fmtUsd(t?.costUsd ?? 0)}
              sub={`${t?.calls ?? 0} calls · ${fmtTokens((t?.inputTokens ?? 0) + (t?.outputTokens ?? 0))} tok`}
            />
          );
        })}
      </div>

      {/* Top spenders by call site */}
      <Card>
        <CardHeader>
          <CardTitle>Top spenders by call site</CardTitle>
          <CardDescription>
            Where the budget went. Click a row in the audit / Jarvis pipeline to find which
            route is the hog.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Call site</th>
                <th className="py-2 pr-3">Feature</th>
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3 text-right">Calls</th>
                <th className="py-2 pr-3 text-right">In</th>
                <th className="py-2 pr-3 text-right">Out</th>
                <th className="py-2 pr-3 text-right">Cache R</th>
                <th className="py-2 pr-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byCallSite ?? []).map((row, i) => (
                <tr key={`${row.callSite}-${row.model}`} className="border-b last:border-0">
                  <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.callSite}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={row.feature === "jarvis" ? "default" : row.feature === "audit" ? "secondary" : "outline"}>
                      {row.feature}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.model}</td>
                  <td className="py-2 pr-3 text-right">{row.calls}</td>
                  <td className="py-2 pr-3 text-right">{fmtTokens(row.inputTokens)}</td>
                  <td className="py-2 pr-3 text-right">{fmtTokens(row.outputTokens)}</td>
                  <td className="py-2 pr-3 text-right">{fmtTokens(row.cacheReadTokens)}</td>
                  <td className="py-2 pr-3 text-right font-medium">{fmtUsd(row.costUsd)}</td>
                </tr>
              ))}
              {(data?.byCallSite ?? []).length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground text-sm">
                    No AI calls recorded in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* By model */}
      <Card>
        <CardHeader>
          <CardTitle>By model</CardTitle>
          <CardDescription>Which models the app is actually using.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3">Provider</th>
                <th className="py-2 pr-3 text-right">Calls</th>
                <th className="py-2 pr-3 text-right">Success</th>
                <th className="py-2 pr-3 text-right">In</th>
                <th className="py-2 pr-3 text-right">Out</th>
                <th className="py-2 pr-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byModel ?? []).map((row) => (
                <tr key={`${row.provider}-${row.model}`} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-mono text-xs">{row.model}</td>
                  <td className="py-2 pr-3">{row.provider}</td>
                  <td className="py-2 pr-3 text-right">{row.calls}</td>
                  <td className="py-2 pr-3 text-right">
                    {row.calls === 0 ? "–" : `${Math.round((row.successCount / row.calls) * 100)}%`}
                  </td>
                  <td className="py-2 pr-3 text-right">{fmtTokens(row.inputTokens)}</td>
                  <td className="py-2 pr-3 text-right">{fmtTokens(row.outputTokens)}</td>
                  <td className="py-2 pr-3 text-right font-medium">{fmtUsd(row.costUsd)}</td>
                </tr>
              ))}
              {(data?.byModel ?? []).length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground text-sm">
                    No data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* By user */}
      <Card>
        <CardHeader>
          <CardTitle>By user</CardTitle>
          <CardDescription>Who&apos;s using Jarvis the most.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3 text-right">Calls</th>
                <th className="py-2 pr-3 text-right">In</th>
                <th className="py-2 pr-3 text-right">Out</th>
                <th className="py-2 pr-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byUser ?? []).map((row) => (
                <tr key={row.userId ?? "anon"} className="border-b last:border-0">
                  <td className="py-2 pr-3">
                    {row.userId ? (
                      <span>
                        {row.userName ?? "(unknown)"}{" "}
                        <span className="text-muted-foreground text-xs">{row.userEmail}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">background / no user</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">{row.calls}</td>
                  <td className="py-2 pr-3 text-right">{fmtTokens(row.inputTokens)}</td>
                  <td className="py-2 pr-3 text-right">{fmtTokens(row.outputTokens)}</td>
                  <td className="py-2 pr-3 text-right font-medium">{fmtUsd(row.costUsd)}</td>
                </tr>
              ))}
              {(data?.byUser ?? []).length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground text-sm">
                    No data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Recent errors */}
      <Card>
        <CardHeader>
          <CardTitle>Recent errors & rate limits</CardTitle>
          <CardDescription>
            Last 50 failed calls in this window. A misconfig (wrong model, expired key) shows up
            here first.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Feature</th>
                <th className="py-2 pr-3">Call site</th>
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentErrors ?? []).map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 text-xs whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge variant={row.status === "rate_limited" ? "secondary" : "destructive"}>
                      {row.status}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3">{row.feature}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.callSite}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.model}</td>
                  <td className="py-2 pr-3 text-xs text-red-500 max-w-md truncate" title={row.errorMessage ?? undefined}>
                    {row.errorMessage}
                  </td>
                </tr>
              ))}
              {(data?.recentErrors ?? []).length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground text-sm">
                    No errors. Nice.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Daily breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Daily cost</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 pr-3">Day</th>
                <th className="py-2 pr-3 text-right">Jarvis</th>
                <th className="py-2 pr-3 text-right">Audit</th>
                <th className="py-2 pr-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(data?.daily ?? []).map((row) => (
                <tr key={row.day} className="border-b last:border-0">
                  <td className="py-2 pr-3">{row.day}</td>
                  <td className="py-2 pr-3 text-right">{fmtUsd(row.jarvisCost)}</td>
                  <td className="py-2 pr-3 text-right">{fmtUsd(row.auditCost)}</td>
                  <td className="py-2 pr-3 text-right font-medium">
                    {fmtUsd(row.jarvisCost + row.auditCost)}
                  </td>
                </tr>
              ))}
              {(data?.daily ?? []).length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground text-sm">
                    No data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-xl font-semibold mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
