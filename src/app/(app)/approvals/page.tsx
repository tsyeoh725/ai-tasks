"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Inbox,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type RecommendationAction = "kill" | "pause" | "boost_budget" | "duplicate";
type Verdict = "approved" | "rejected" | "pending";
type Risk = "low" | "medium" | "high";

// Mirrors action-executor.ts:163-205 fall-through:
//   ad_set daily → campaign daily (CBO) → campaign lifetime (CBO) → none.
type BudgetLevel = "ad_set" | "campaign_daily" | "campaign_lifetime" | "none";

type BudgetInfo = {
  level: BudgetLevel;
  current: number | null;
  // executor multiplies by 1.5 and rounds to cents
  projected: number | null;
};

type Entry = {
  id: string;
  brandId: string;
  brandName?: string;
  adId: string | null;
  adName?: string;
  recommendation: RecommendationAction;
  reason: string;
  guardReasoning?: string | null;
  confidence: number | null;
  riskLevel: Risk | null;
  guardVerdict: Verdict;
  createdAt: string;
  budgetInfo?: BudgetInfo;
};

const actionVariant: Record<
  RecommendationAction,
  "destructive" | "warning" | "success" | "default"
> = {
  kill: "destructive",
  pause: "warning",
  boost_budget: "success",
  duplicate: "default",
};

const actionLabel: Record<RecommendationAction, string> = {
  kill: "KILL",
  pause: "PAUSE",
  boost_budget: "BOOST",
  duplicate: "DUPLICATE",
};

// Plain-English description of what gets executed on approval — surfaced
// next to the Approve button so the user knows the consequence of clicking
// it, instead of having to decode the action badge. boost_budget is dynamic
// (see describeBoostBudget) because the executor targets ad-set or campaign
// budget depending on which one is set.
const actionDescription: Record<Exclude<RecommendationAction, "boost_budget">, string> = {
  kill: "Permanently delete this ad on Meta. Cannot be undone.",
  pause: "Pause this ad on Meta. You can re-activate it later.",
  duplicate: "Duplicate this ad with the brand's standard test settings on Meta.",
};

function fmtRM(n: number): string {
  return `RM ${n.toFixed(2)}`;
}

function describeBoostBudget(info: BudgetInfo | undefined): string {
  if (!info || info.level === "none" || info.current === null || info.projected === null) {
    return "Increase budget by 50% on Meta. No budget found at ad-set or campaign level — approval will likely fail.";
  }
  const delta = `${fmtRM(info.current)} → ${fmtRM(info.projected)}`;
  if (info.level === "ad_set") {
    return `Increase the ad-set daily budget on Meta (${delta}).`;
  }
  if (info.level === "campaign_daily") {
    return `Increase the campaign (CBO) daily budget on Meta (${delta}). Affects every ad set in this campaign.`;
  }
  return `Increase the campaign (CBO) lifetime budget on Meta (${delta}). Affects every ad set in this campaign.`;
}

const budgetLevelLabel: Record<BudgetLevel, string> = {
  ad_set: "Ad set",
  campaign_daily: "Campaign (CBO, daily)",
  campaign_lifetime: "Campaign (CBO, lifetime)",
  none: "None found",
};

function computeBudgetInfo(raw: Record<string, unknown>): BudgetInfo {
  const adSet = raw.adSet as
    | {
        dailyBudget?: number | null;
        campaign?: { dailyBudget?: number | null; lifetimeBudget?: number | null } | null;
      }
    | null
    | undefined;
  const adSetBudget = adSet?.dailyBudget ?? null;
  const cbo = adSet?.campaign;
  const cboDaily = cbo?.dailyBudget ?? null;
  const cboLifetime = cbo?.lifetimeBudget ?? null;

  const project = (n: number) => Math.round(n * 1.5 * 100) / 100;

  if (adSetBudget !== null && adSetBudget > 0) {
    return { level: "ad_set", current: adSetBudget, projected: project(adSetBudget) };
  }
  if (cboDaily !== null && cboDaily > 0) {
    return { level: "campaign_daily", current: cboDaily, projected: project(cboDaily) };
  }
  if (cboLifetime !== null && cboLifetime > 0) {
    return { level: "campaign_lifetime", current: cboLifetime, projected: project(cboLifetime) };
  }
  return { level: "none", current: null, projected: null };
}

const riskColor: Record<Risk, string> = {
  low: "text-emerald-300",
  medium: "text-amber-300",
  high: "text-red-300",
};

export default function ApprovalsPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  // Per-row editable state. budgetInputs is the string the user is typing
  // (string so partial entries like "" or "1." don't fight the input);
  // remarks is the textarea content. Keyed by entry id.
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/approvals");
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.entries || [];
      setEntries(
        // The API returns Drizzle-shaped rows: camelCase columns plus the
        // joined `brand` and `ad` relation keys (singular). The previous
        // code read `e.brands` / `e.ads` (plural) and snake_case column
        // names, which is why every card said "Unknown ad" / "Brand: —".
        list.map((e: Record<string, unknown>) => {
          const row = e as unknown as Entry;
          const budgetInfo =
            row.recommendation === "boost_budget" ? computeBudgetInfo(e) : undefined;
          return {
            ...row,
            brandName: (e.brand as { name?: string } | null)?.name,
            adName: (e.ad as { name?: string } | null)?.name,
            budgetInfo,
          };
        }),
      );
    } catch {
      // noop
    }
    setLoading(false);
  }, []);

  // Seed the per-row inputs with sensible defaults whenever the entry list
  // changes: boost_budget rows pre-fill the +50% projection, others stay
  // empty. Existing user-typed values are preserved.
  useEffect(() => {
    setBudgetInputs((prev) => {
      const next = { ...prev };
      for (const entry of entries) {
        if (
          entry.recommendation === "boost_budget" &&
          next[entry.id] === undefined &&
          entry.budgetInfo?.projected !== null &&
          entry.budgetInfo?.projected !== undefined
        ) {
          next[entry.id] = entry.budgetInfo.projected.toFixed(2);
        }
      }
      return next;
    });
  }, [entries]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/dep change; not migrating to Suspense
    fetchPending();
  }, [fetchPending]);

  async function handleAction(id: string, verdict: "approved" | "rejected") {
    setProcessing((prev) => new Set(prev).add(id));
    setStatus(null);
    try {
      const entry = entries.find((e) => e.id === id);
      const remark = remarks[id]?.trim() || undefined;
      // Only send overrideBudget for boost_budget approvals, and only when
      // it parses to a positive finite number. Empty / unchanged input is
      // sent as undefined so the executor falls back to its default *1.5.
      let overrideBudget: number | undefined;
      if (verdict === "approved" && entry?.recommendation === "boost_budget") {
        const raw = budgetInputs[id];
        const parsed = raw !== undefined && raw !== "" ? Number(raw) : NaN;
        if (Number.isFinite(parsed) && parsed > 0) {
          overrideBudget = parsed;
        }
      }
      const res = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, userRemark: remark, overrideBudget }),
      });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setBudgetInputs((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setRemarks((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setStatus(verdict === "approved" ? "Approved & executed" : "Rejected");
      } else {
        setStatus("Action failed");
      }
    } catch {
      setStatus("Action failed");
    }
    setProcessing((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleBulk(verdict: "approved" | "rejected") {
    const ids = Array.from(selected);
    for (const id of ids) {
      await handleAction(id, verdict);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-5 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Pending Approvals
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Review and approve/reject AI Guard recommendations
          </p>
        </div>
        {selected.size > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulk("approved")}
            >
              <CheckCircle2 />
              Approve {selected.size}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulk("rejected")}
            >
              <XCircle />
              Reject {selected.size}
            </Button>
          </div>
        )}
      </div>

      {status && (
        <div className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
          {status}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-gray-50 border border-gray-200 animate-pulse"
            />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Inbox className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500">No pending approvals</p>
            <p className="text-xs text-gray-400 mt-1">All clear</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const isProcessing = processing.has(entry.id);
            const isExpanded = expanded.has(entry.id);
            const isSelected = selected.has(entry.id);
            const confidencePct = Math.round((entry.confidence ?? 0) * 100);

            return (
              <Card key={entry.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(entry.id)}
                        className="h-4 w-4 rounded accent-indigo-500 shrink-0"
                      />
                      <Badge variant={actionVariant[entry.recommendation]}>
                        {actionLabel[entry.recommendation]}
                      </Badge>
                      <CardTitle className="truncate">
                        {entry.adName || "Unknown ad"}
                      </CardTitle>
                    </div>
                    <Badge variant="warning">Pending</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4">
                    {/* Confidence gauge */}
                    <div className="shrink-0">
                      <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
                        Confidence
                      </div>
                      <div className="relative h-10 w-10">
                        <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                          <circle
                            cx="18"
                            cy="18"
                            r="14"
                            fill="none"
                            stroke="rgb(255 255 255 / 0.08)"
                            strokeWidth="3"
                          />
                          <circle
                            cx="18"
                            cy="18"
                            r="14"
                            fill="none"
                            stroke={
                              confidencePct >= 75
                                ? "rgb(52 211 153)"
                                : confidencePct >= 50
                                  ? "rgb(251 191 36)"
                                  : "rgb(248 113 113)"
                            }
                            strokeWidth="3"
                            strokeDasharray={`${(confidencePct / 100) * 88} 88`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-medium">
                          {confidencePct}%
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs text-gray-600">
                        <span className="text-gray-400">Brand:</span>{" "}
                        {entry.brandName || "—"}
                      </p>
                      <p className="text-xs text-gray-600">
                        <span className="text-gray-400">Reason:</span>{" "}
                        {entry.reason}
                      </p>
                      {entry.riskLevel && (
                        <p className="text-xs">
                          <span className="text-gray-400">Risk:</span>{" "}
                          <span
                            className={cn(
                              "font-medium uppercase",
                              riskColor[entry.riskLevel],
                            )}
                          >
                            {entry.riskLevel}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* What pressing Approve actually does. Spelled out so the
                      user doesn't have to decode the small action badge. */}
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-900">
                    <span className="font-semibold uppercase tracking-wider text-[10px] text-indigo-700">
                      If approved
                    </span>
                    <span className="ml-2">
                      {entry.recommendation === "boost_budget"
                        ? describeBoostBudget(entry.budgetInfo)
                        : actionDescription[entry.recommendation]}
                    </span>
                    {entry.recommendation === "boost_budget" && entry.budgetInfo && (
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-indigo-700">
                        Target: {budgetLevelLabel[entry.budgetInfo.level]}
                      </div>
                    )}
                  </div>

                  {entry.guardReasoning && (
                    <div>
                      <button
                        onClick={() => toggleExpand(entry.id)}
                        className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                        AI Guard reasoning
                      </button>
                      {isExpanded && (
                        <div className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700 whitespace-pre-wrap">
                          {entry.guardReasoning}
                        </div>
                      )}
                    </div>
                  )}

                  {entry.recommendation === "boost_budget" &&
                    entry.budgetInfo &&
                    entry.budgetInfo.level !== "none" && (
                      <div>
                        <label
                          htmlFor={`budget-${entry.id}`}
                          className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1"
                        >
                          New budget (RM)
                        </label>
                        <input
                          id={`budget-${entry.id}`}
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={budgetInputs[entry.id] ?? ""}
                          onChange={(ev) =>
                            setBudgetInputs((prev) => ({
                              ...prev,
                              [entry.id]: ev.target.value,
                            }))
                          }
                          disabled={isProcessing}
                          className="w-32 rounded-md border border-gray-300 px-2 py-1 text-xs font-mono"
                        />
                        <span className="ml-2 text-[10px] text-gray-500">
                          default {fmtRM(entry.budgetInfo.projected ?? 0)} (current ×1.5)
                        </span>
                      </div>
                    )}

                  <div>
                    <label
                      htmlFor={`remark-${entry.id}`}
                      className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1"
                    >
                      Remark for AI (optional)
                    </label>
                    <textarea
                      id={`remark-${entry.id}`}
                      rows={2}
                      placeholder="e.g. Don't boost above RM200 for this brand"
                      value={remarks[entry.id] ?? ""}
                      onChange={(ev) =>
                        setRemarks((prev) => ({ ...prev, [entry.id]: ev.target.value }))
                      }
                      disabled={isProcessing}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                    />
                    <p className="mt-1 text-[10px] text-gray-400">
                      Saved as brand memory — the AI Guard reads recent remarks on future cycles.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleAction(entry.id, "approved")}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <CheckCircle2 />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleAction(entry.id, "rejected")}
                      disabled={isProcessing}
                    >
                      <XCircle />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
