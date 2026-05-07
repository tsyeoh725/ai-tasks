"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  projected: number | null;
};

type Entry = {
  id: string;
  brandId: string;
  brandName?: string;
  adId: string | null;
  adName?: string;
  adSetId?: string | null;
  campaignId?: string | null;
  recommendation: RecommendationAction;
  reason: string;
  guardReasoning?: string | null;
  confidence: number | null;
  riskLevel: Risk | null;
  guardVerdict: Verdict;
  createdAt: string;
  budgetInfo?: BudgetInfo;
};

// A Group is what the UI actually renders. Multiple journal entries that
// would result in the same Meta call get folded into one card so the
// operator approves once instead of N times. boost_budget rows that share
// an ad set (or share a CBO campaign) collapse; everything else stays 1:1.
type Group = {
  key: string;
  members: Entry[];
  representative: Entry;
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

// boost_budget entries collapse when they target the same Meta-side budget.
// Ad-set-level rows fold by adSetId; CBO rows fold by campaignId. Anything
// else stays per-entry so each card represents exactly one Meta side-effect.
function groupKey(entry: Entry): string {
  if (entry.recommendation !== "boost_budget" || !entry.budgetInfo) {
    return `single:${entry.id}`;
  }
  const level = entry.budgetInfo.level;
  if (level === "ad_set" && entry.adSetId) {
    return `boost:adset:${entry.adSetId}`;
  }
  if ((level === "campaign_daily" || level === "campaign_lifetime") && entry.campaignId) {
    return `boost:campaign:${entry.campaignId}`;
  }
  return `single:${entry.id}`;
}

function buildGroups(entries: Entry[]): Group[] {
  const map = new Map<string, Group>();
  for (const entry of entries) {
    const key = groupKey(entry);
    const existing = map.get(key);
    if (existing) {
      existing.members.push(entry);
    } else {
      map.set(key, {
        key,
        representative: entry,
        members: [entry],
        budgetInfo: entry.budgetInfo,
      });
    }
  }
  // Stable order: preserve representative.createdAt desc (entries already
  // arrive newest-first from the API).
  return Array.from(map.values());
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
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  // Per-group inputs, keyed by group.key (not entry id) so a single budget /
  // remark applies to all collapsed entries in that group.
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const fetchPending = useCallback(async (opts: { showSpinner?: boolean } = {}) => {
    if (opts.showSpinner !== false) setLoading(true);
    try {
      const res = await fetch("/api/approvals");
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.entries || [];
      setEntries(
        list.map((e: Record<string, unknown>) => {
          const row = e as unknown as Entry;
          const budgetInfo =
            row.recommendation === "boost_budget" ? computeBudgetInfo(e) : undefined;
          const adSet = e.adSet as { id?: string; campaign?: { id?: string } | null } | null;
          return {
            ...row,
            brandName: (e.brand as { name?: string } | null)?.name,
            adName: (e.ad as { name?: string } | null)?.name,
            adSetId: adSet?.id ?? null,
            campaignId: adSet?.campaign?.id ?? null,
            budgetInfo,
          };
        }),
      );
    } catch {
      // noop
    }
    if (opts.showSpinner !== false) setLoading(false);
  }, []);

  const groups = useMemo(() => buildGroups(entries), [entries]);

  // Seed per-group budget defaults whenever groups change. We use the
  // representative entry's projected (×1.5) value as the prefilled "new
  // budget"; the user can then overwrite with whatever they actually want.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeding derived input defaults from groups
    setBudgetInputs((prev) => {
      const next = { ...prev };
      for (const group of groups) {
        const info = group.budgetInfo;
        if (
          group.representative.recommendation === "boost_budget" &&
          next[group.key] === undefined &&
          info?.projected !== null &&
          info?.projected !== undefined
        ) {
          next[group.key] = info.projected.toFixed(2);
        }
      }
      return next;
    });
  }, [groups]);

  // Initial load + visibility-aware 10s poll. We pause polling when the tab
  // is hidden so we don't burn DB queries while the user is in another tab.
  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (cancelled || document.hidden) return;
      void fetchPending({ showSpinner: false });
    };

    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch + interval poll
    void fetchPending();
    interval = setInterval(tick, 10_000);

    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchPending]);

  // Drop selections that no longer correspond to a visible group (e.g. after
  // an approval, or when a poll tick removes processed entries).
  useEffect(() => {
    const live = new Set(groups.map((g) => g.key));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prune stale selections after group recompute
    setSelectedGroups((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (live.has(k)) next.add(k);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [groups]);

  // Resolve a per-group override+remark, then fire one POST per member entry.
  // We loop sequentially so the executor doesn't race on the same Meta object;
  // for typical groups (1–5 ads in an ad set) this finishes in ~a few seconds.
  async function handleGroupAction(group: Group, verdict: "approved" | "rejected") {
    const memberIds = group.members.map((m) => m.id);
    const remark = remarks[group.key]?.trim() || undefined;
    let overrideBudget: number | undefined;
    if (verdict === "approved" && group.representative.recommendation === "boost_budget") {
      const raw = budgetInputs[group.key];
      const parsed = raw !== undefined && raw !== "" ? Number(raw) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) overrideBudget = parsed;
    }

    setProcessing((prev) => {
      const next = new Set(prev);
      for (const id of memberIds) next.add(id);
      return next;
    });
    setStatus(null);

    let okCount = 0;
    let failCount = 0;
    for (const id of memberIds) {
      try {
        const res = await fetch(`/api/approvals/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verdict, userRemark: remark, overrideBudget }),
        });
        if (res.ok) okCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }

    if (okCount > 0) {
      setEntries((prev) => prev.filter((e) => !memberIds.includes(e.id)));
      setSelectedGroups((prev) => {
        const next = new Set(prev);
        next.delete(group.key);
        return next;
      });
      setBudgetInputs((prev) => {
        const next = { ...prev };
        delete next[group.key];
        return next;
      });
      setRemarks((prev) => {
        const next = { ...prev };
        delete next[group.key];
        return next;
      });
      // Sidebar listens for this event and refetches /api/approvals so the
      // pending-count badge clears as soon as the queue empties — without it
      // the "4" sticks until a hard reload.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("approvals:changed"));
      }
    }

    setProcessing((prev) => {
      const next = new Set(prev);
      for (const id of memberIds) next.delete(id);
      return next;
    });

    const verb = verdict === "approved" ? "Approved" : "Rejected";
    if (failCount === 0) {
      setStatus(
        memberIds.length === 1
          ? `${verb} & executed`
          : `${verb} ${okCount} ad${okCount === 1 ? "" : "s"} in this group`,
      );
    } else {
      setStatus(`${verb} ${okCount}/${memberIds.length} — ${failCount} failed`);
    }
  }

  async function handleBulk(verdict: "approved" | "rejected") {
    const targets = groups.filter((g) => selectedGroups.has(g.key));
    for (const g of targets) {
      await handleGroupAction(g, verdict);
    }
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelect(key: string) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedGroups((prev) => {
      // If everything is already selected, clear; otherwise select all.
      if (prev.size === groups.length) return new Set();
      return new Set(groups.map((g) => g.key));
    });
  }

  const allSelected = groups.length > 0 && selectedGroups.size === groups.length;
  const someSelected = selectedGroups.size > 0 && !allSelected;

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
        <div className="flex items-center gap-2">
          {groups.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-gray-600 select-none cursor-pointer pr-2">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded accent-indigo-500"
              />
              Select all ({groups.length})
            </label>
          )}
          {selectedGroups.size > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulk("approved")}
              >
                <CheckCircle2 />
                Approve {selectedGroups.size}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulk("rejected")}
              >
                <XCircle />
                Reject {selectedGroups.size}
              </Button>
            </>
          )}
        </div>
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
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Inbox className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500">No pending approvals</p>
            <p className="text-xs text-gray-400 mt-1">All clear</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const entry = group.representative;
            const groupBusy = group.members.some((m) => processing.has(m.id));
            const isExpanded = expanded.has(group.key);
            const isSelected = selectedGroups.has(group.key);
            const confidencePct = Math.round((entry.confidence ?? 0) * 100);
            const memberCount = group.members.length;
            const isGrouped = memberCount > 1;
            const otherNames = group.members
              .map((m) => m.adName)
              .filter((n): n is string => Boolean(n));

            return (
              <Card key={group.key}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(group.key)}
                        className="h-4 w-4 rounded accent-indigo-500 shrink-0"
                      />
                      <Badge variant={actionVariant[entry.recommendation]}>
                        {actionLabel[entry.recommendation]}
                      </Badge>
                      <CardTitle className="truncate">
                        {isGrouped
                          ? `${memberCount} ads sharing a ${
                              group.budgetInfo?.level === "ad_set" ? "ad set" : "campaign"
                            }`
                          : entry.adName || "Unknown ad"}
                      </CardTitle>
                    </div>
                    <Badge variant="warning">Pending</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4">
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
                      {isGrouped && otherNames.length > 0 && (
                        <p className="text-[11px] text-gray-500">
                          <span className="text-gray-400">Affects:</span>{" "}
                          {otherNames.slice(0, 3).join(", ")}
                          {otherNames.length > 3 ? `, +${otherNames.length - 3} more` : ""}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-900">
                    <span className="font-semibold uppercase tracking-wider text-[10px] text-indigo-700">
                      If approved
                    </span>
                    <span className="ml-2">
                      {entry.recommendation === "boost_budget"
                        ? describeBoostBudget(group.budgetInfo)
                        : actionDescription[entry.recommendation]}
                    </span>
                    {entry.recommendation === "boost_budget" && group.budgetInfo && (
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-indigo-700">
                        Target: {budgetLevelLabel[group.budgetInfo.level]}
                        {isGrouped && ` · 1 Meta call covers all ${memberCount} ads`}
                      </div>
                    )}
                  </div>

                  {entry.guardReasoning && (
                    <div>
                      <button
                        onClick={() => toggleExpand(group.key)}
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
                    group.budgetInfo &&
                    group.budgetInfo.level !== "none" && (
                      <div>
                        <label
                          htmlFor={`budget-${group.key}`}
                          className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1"
                        >
                          New budget (RM)
                        </label>
                        <input
                          id={`budget-${group.key}`}
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={budgetInputs[group.key] ?? ""}
                          onChange={(ev) =>
                            setBudgetInputs((prev) => ({
                              ...prev,
                              [group.key]: ev.target.value,
                            }))
                          }
                          disabled={groupBusy}
                          className="w-32 rounded-md border border-gray-300 px-2 py-1 text-xs font-mono"
                        />
                        <span className="ml-2 text-[10px] text-gray-500">
                          default {fmtRM(group.budgetInfo.projected ?? 0)} (current ×1.5)
                        </span>
                      </div>
                    )}

                  <div>
                    <label
                      htmlFor={`remark-${group.key}`}
                      className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1"
                    >
                      Remark for AI (optional)
                    </label>
                    <textarea
                      id={`remark-${group.key}`}
                      rows={2}
                      placeholder="e.g. Don't boost above RM200 for this brand"
                      value={remarks[group.key] ?? ""}
                      onChange={(ev) =>
                        setRemarks((prev) => ({ ...prev, [group.key]: ev.target.value }))
                      }
                      disabled={groupBusy}
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
                      onClick={() => handleGroupAction(group, "approved")}
                      disabled={groupBusy}
                    >
                      {groupBusy ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <CheckCircle2 />
                      )}
                      Approve{isGrouped ? ` (${memberCount})` : ""}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleGroupAction(group, "rejected")}
                      disabled={groupBusy}
                    >
                      <XCircle />
                      Reject{isGrouped ? ` (${memberCount})` : ""}
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
