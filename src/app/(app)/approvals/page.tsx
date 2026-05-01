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

type Entry = {
  id: string;
  brand_id: string;
  brand_name?: string;
  ad_id: string | null;
  ad_name?: string;
  recommendation: RecommendationAction;
  reason: string;
  guard_reasoning?: string | null;
  confidence: number | null;
  risk_level: Risk | null;
  guard_verdict: Verdict;
  created_at: string;
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

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/approvals");
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.entries || [];
      setEntries(
        list.map((e: Record<string, unknown>) => ({
          ...(e as unknown as Entry),
          brand_name: (e.brands as { name?: string } | null)?.name,
          ad_name: (e.ads as { name?: string } | null)?.name,
        })),
      );
    } catch {
      // noop
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/dep change; not migrating to Suspense
    fetchPending();
  }, [fetchPending]);

  async function handleAction(id: string, verdict: "approved" | "rejected") {
    setProcessing((prev) => new Set(prev).add(id));
    setStatus(null);
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict }),
      });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
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
                        {entry.ad_name || "Unknown ad"}
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
                        {entry.brand_name || "—"}
                      </p>
                      <p className="text-xs text-gray-600">
                        <span className="text-gray-400">Reason:</span>{" "}
                        {entry.reason}
                      </p>
                      {entry.risk_level && (
                        <p className="text-xs">
                          <span className="text-gray-400">Risk:</span>{" "}
                          <span
                            className={cn(
                              "font-medium uppercase",
                              riskColor[entry.risk_level],
                            )}
                          >
                            {entry.risk_level}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  {entry.guard_reasoning && (
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
                          {entry.guard_reasoning}
                        </div>
                      )}
                    </div>
                  )}

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
