"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  guard_reasoning: string | null;
  confidence: number | null;
  risk_level: Risk | null;
  guard_verdict: Verdict;
  action_taken: boolean;
  action_result: Record<string, unknown> | null;
  created_at: string;
};

type Brand = { id: string; name: string };

const verdictVariant: Record<
  Verdict,
  "success" | "destructive" | "warning"
> = {
  approved: "success",
  rejected: "destructive",
  pending: "warning",
};

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export default function JournalPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [verdictFilter, setVerdictFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((data) => {
        const list: Brand[] = Array.isArray(data) ? data : data.brands || [];
        setBrands(list);
      })
      .catch(() => {});
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (verdictFilter !== "all") params.set("verdict", verdictFilter);
      if (actionFilter !== "all") params.set("action", actionFilter);
      if (brandFilter !== "all") params.set("brandId", brandFilter);
      params.set("startDate", dateFrom);
      params.set("endDate", dateTo);

      const res = await fetch(`/api/journal?${params.toString()}`);
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
  }, [verdictFilter, actionFilter, brandFilter, dateFrom, dateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/dep change; not migrating to Suspense
    fetchEntries();
  }, [fetchEntries]);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Decision Journal
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Complete history of all recommendations and actions
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3 flex flex-wrap gap-3 items-end">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
              Verdict
            </div>
            <Select
              value={verdictFilter}
              onValueChange={(v) => v && setVerdictFilter(v)}
            >
              <SelectTrigger className="h-8 w-32">
                <SelectValue>{verdictFilter}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
              Action
            </div>
            <Select
              value={actionFilter}
              onValueChange={(v) => v && setActionFilter(v)}
            >
              <SelectTrigger className="h-8 w-36">
                <SelectValue>{actionFilter}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="kill">Kill</SelectItem>
                <SelectItem value="pause">Pause</SelectItem>
                <SelectItem value="boost_budget">Boost Budget</SelectItem>
                <SelectItem value="duplicate">Duplicate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
              Brand
            </div>
            <Select
              value={brandFilter}
              onValueChange={(v) => v && setBrandFilter(v)}
            >
              <SelectTrigger className="h-8 w-40">
                <SelectValue>
                  {brandFilter === "all"
                    ? "All brands"
                    : brands.find((b) => b.id === brandFilter)?.name || "Brand"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
              From
            </div>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 w-36 font-mono text-xs"
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
              To
            </div>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 w-36 font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-14 rounded-xl bg-gray-100 border border-gray-200 animate-pulse"
            />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BookOpen className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500">No journal entries</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-[11px] text-gray-400 uppercase tracking-wider">
                  <th className="text-left font-medium px-3 py-2 w-8"></th>
                  <th className="text-left font-medium px-3 py-2 w-32">
                    Timestamp
                  </th>
                  <th className="text-left font-medium px-3 py-2">Brand</th>
                  <th className="text-left font-medium px-3 py-2">Ad</th>
                  <th className="text-left font-medium px-3 py-2">Action</th>
                  <th className="text-left font-medium px-3 py-2">Verdict</th>
                  <th className="text-right font-medium px-3 py-2">Conf.</th>
                  <th className="text-left font-medium px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  const confidencePct = Math.round((entry.confidence ?? 0) * 100);

                  return (
                    <Fragment key={entry.id}>
                      <tr
                        onClick={() =>
                          setExpandedId(isExpanded ? null : entry.id)
                        }
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-2.5">
                          {isExpanded ? (
                            <ChevronDown className="w-3 h-3 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-gray-400" />
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-gray-500">
                          {formatDistanceToNow(new Date(entry.created_at), {
                            addSuffix: true,
                          })}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">
                          {entry.brand_name || "—"}
                        </td>
                        <td className="px-3 py-2.5 truncate max-w-[240px] text-gray-800">
                          {entry.ad_name || entry.reason.slice(0, 50)}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline">
                            {entry.recommendation.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant={verdictVariant[entry.guard_verdict]}>
                            {entry.guard_verdict}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-700">
                          {entry.confidence !== null ? `${confidencePct}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          {entry.action_taken ? (
                            <Badge variant="success">Executed</Badge>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-3 py-3 bg-gray-50 border-b border-gray-100"
                          >
                            <div className="space-y-3 text-xs">
                              <div>
                                <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
                                  Reason
                                </div>
                                <p className="text-gray-700">{entry.reason}</p>
                              </div>
                              {entry.guard_reasoning && (
                                <div>
                                  <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
                                    AI Guard Analysis
                                  </div>
                                  <p className="text-gray-700 whitespace-pre-wrap">
                                    {entry.guard_reasoning}
                                  </p>
                                </div>
                              )}
                              {entry.confidence !== null && (
                                <div className="flex gap-6">
                                  <div>
                                    <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
                                      Confidence
                                    </div>
                                    <p className="font-mono text-gray-800">{confidencePct}%</p>
                                  </div>
                                  {entry.risk_level && (
                                    <div>
                                      <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
                                        Risk
                                      </div>
                                      <p className="uppercase text-gray-800">
                                        {entry.risk_level}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                              {entry.action_result && (
                                <div>
                                  <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
                                    Action Result
                                  </div>
                                  <pre className="text-[11px] font-mono bg-gray-100 border border-gray-200 rounded-lg p-2 overflow-x-auto text-gray-700">
                                    {JSON.stringify(entry.action_result, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
