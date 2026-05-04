"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Megaphone,
  Loader2,
  Pause,
  Play,
  Calendar as CalendarIcon,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type AdData = {
  id: string;
  name: string;
  status: string;
  cpl: number | null;
  ctr: number | null;
  frequency: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  metaAdId: string;
  brandId: string;
  brandName?: string;
  adSetName?: string;
  campaignName?: string;
};

type BrandData = {
  id: string;
  name: string;
  config: {
    thresholds: {
      cplMax: number | null;
      ctrMin: number | null;
      frequencyMax: number | null;
    };
    costMetric?: { label: string; actionType: string };
  };
};

type AdHealth = "kill" | "warning" | "healthy" | "winner" | "neutral";

function getAdHealth(
  ad: AdData,
  t: BrandData["config"]["thresholds"],
): AdHealth {
  if (
    t.cplMax &&
    t.ctrMin &&
    ad.cpl !== null &&
    ad.ctr !== null &&
    ad.cpl < t.cplMax * 0.5 &&
    ad.ctr > t.ctrMin * 2
  )
    return "winner";
  if (
    t.cplMax &&
    t.ctrMin &&
    ad.cpl !== null &&
    ad.ctr !== null &&
    (ad.cpl > t.cplMax * 2 || ad.ctr < t.ctrMin * 0.4)
  )
    return "kill";
  let b = 0;
  if (t.cplMax && ad.cpl !== null && ad.cpl > t.cplMax) b++;
  if (t.ctrMin && ad.ctr !== null && ad.ctr < t.ctrMin) b++;
  if (t.frequencyMax && ad.frequency !== null && ad.frequency > t.frequencyMax)
    b++;
  if (b > 0) return "warning";
  if (ad.cpl === null && ad.ctr === null) return "neutral";
  return "healthy";
}

const HEALTH_STYLES: Record<
  AdHealth,
  { label: string; badgeVariant: "destructive" | "warning" | "success" | "secondary" | "default"; ring: string }
> = {
  kill: {
    label: "KILL",
    badgeVariant: "destructive",
    ring: "ring-1 ring-red-400/30 bg-red-500/5",
  },
  warning: {
    label: "WARNING",
    badgeVariant: "warning",
    ring: "ring-1 ring-amber-400/25 bg-amber-500/5",
  },
  healthy: {
    label: "HEALTHY",
    badgeVariant: "success",
    ring: "ring-1 ring-emerald-400/25 bg-emerald-500/5",
  },
  winner: {
    label: "WINNER",
    badgeVariant: "success",
    ring: "ring-1 ring-emerald-400/50 bg-emerald-500/10",
  },
  neutral: {
    label: "NO DATA",
    badgeVariant: "secondary",
    ring: "",
  },
};

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

type SortKey = "spend" | "cpl" | "ctr" | "freq" | "name";
type GroupKey = "none" | "brand" | "campaign" | "health";

export default function AdsPage() {
  const [selectedBrand, setSelectedBrand] = useState(() => {
    if (typeof window === "undefined") return "all";
    return new URLSearchParams(window.location.search).get("brand") ?? "all";
  });
  const [ads, setAds] = useState<AdData[]>([]);
  const [brands, setBrands] = useState<BrandData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);
  const [healthFilter, setHealthFilter] = useState<AdHealth | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [groupKey, setGroupKey] = useState<GroupKey>("none");
  const [syncingAll, setSyncingAll] = useState(false);
  const [auditing, setAuditing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBrand !== "all") params.set("brandId", selectedBrand);
      params.set("startDate", dateFrom);
      params.set("endDate", dateTo);
      const res = await fetch(`/api/meta-ads?${params.toString()}`);
      const data = await res.json();
      setBrands(data.brands || []);
      const rawAds = (data.ads || []) as Record<string, unknown>[];
      setAds(
        rawAds.map((ad) => ({
          id: ad.id as string,
          name: ad.name as string,
          status: ad.status as string,
          cpl: (ad.cpl as number | null) ?? null,
          ctr: (ad.ctr as number | null) ?? null,
          frequency: (ad.frequency as number | null) ?? null,
          spend: (ad.spend as number) || 0,
          impressions: (ad.impressions as number) || 0,
          clicks: (ad.clicks as number) || 0,
          leads: (ad.leads as number) || 0,
          metaAdId: ad.metaAdId as string,
          brandId: ad.brandId as string,
          brandName: (ad.brandName as string | null) ?? undefined,
          adSetName: (ad.adSetName as string | null) ?? undefined,
          campaignName: (ad.campaignName as string | null) ?? undefined,
        })),
      );
    } catch {
      // noop
    }
    setLoading(false);
  }, [selectedBrand, dateFrom, dateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/dep change; not migrating to Suspense
    fetchData();
  }, [fetchData]);

  function setDatePreset(days: number) {
    setDateFrom(daysAgo(days));
    setDateTo(new Date().toISOString().split("T")[0]);
  }

  async function handleSyncAll() {
    if (syncingAll) return;
    setSyncingAll(true);
    setStatus(null);
    let ok = 0;
    let failed = 0;
    const total = brands.length;
    for (let i = 0; i < brands.length; i++) {
      const b = brands[i];
      setStatus(`Syncing ${b.name} (${i + 1}/${total})…`);
      try {
        const res = await fetch("/api/meta/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId: b.id }),
        });
        if (res.ok) ok++;
        else failed++;
      } catch {
        failed++;
      }
    }
    setStatus(`Sync complete — ${ok}/${total} brands updated${failed ? `, ${failed} failed` : ""}`);
    setSyncingAll(false);
    await fetchData();
  }

  async function handleRunAudit() {
    if (auditing) return;
    setAuditing(true);
    setStatus("Running audit across all brands…");
    try {
      const res = await fetch("/api/cron/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const results = (data.results || []) as Array<{ brandName: string; recommendationsCount: number; pending: number; tasks?: { created: number } }>;
        const totalRecs = results.reduce((s, r) => s + (r.recommendationsCount || 0), 0);
        const totalPending = results.reduce((s, r) => s + (r.pending || 0), 0);
        const totalTasks = results.reduce((s, r) => s + (r.tasks?.created || 0), 0);
        setStatus(`Audit complete — ${results.length} brand${results.length === 1 ? "" : "s"} scanned, ${totalRecs} recommendation${totalRecs === 1 ? "" : "s"}, ${totalPending} pending approval, ${totalTasks} task${totalTasks === 1 ? "" : "s"} created`);
      } else {
        setStatus(data.error || "Audit failed");
      }
    } catch {
      setStatus("Audit failed (network error)");
    }
    setAuditing(false);
  }

  async function handleAdAction(adId: string, action: "pause" | "activate") {
    setActionLoading(adId);
    setStatus(null);
    try {
      const res = await fetch("/api/meta-ads/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId, action }),
      });
      const data = await res.json();
      if (res.ok && data.success !== false) {
        const newStatus =
          (data.new_status as string) || (action === "pause" ? "PAUSED" : "ACTIVE");
        setAds((prev) =>
          prev.map((a) => (a.id === adId ? { ...a, status: newStatus } : a)),
        );
        setStatus(`Ad ${action === "pause" ? "paused" : "activated"}`);
      } else {
        setStatus(data.error || "Action failed");
      }
    } catch {
      setStatus("Action failed");
    }
    setActionLoading(null);
  }

  function getThresholds(bid: string) {
    return (
      brands.find((b) => b.id === bid)?.config?.thresholds || {
        cplMax: null,
        ctrMin: null,
        frequencyMax: null,
      }
    );
  }
  function getCostLabel(bid: string) {
    return brands.find((b) => b.id === bid)?.config?.costMetric?.label || "CPL";
  }

  const displayCostLabel =
    selectedBrand !== "all"
      ? getCostLabel(selectedBrand)
      : brands[0]
        ? getCostLabel(brands[0].id)
        : "CPL";

  const adsWithHealth = ads.map((ad) => ({
    ad,
    health: getAdHealth(ad, getThresholds(ad.brandId)),
  }));

  const filteredAds = adsWithHealth.filter((entry) => {
    if (healthFilter !== "all" && entry.health !== healthFilter) return false;
    return true;
  });

  const sortedAds = [...filteredAds].sort((a, b) => {
    switch (sortKey) {
      case "spend":
        return b.ad.spend - a.ad.spend;
      case "cpl":
        return (a.ad.cpl ?? Infinity) - (b.ad.cpl ?? Infinity);
      case "ctr":
        return (b.ad.ctr ?? -Infinity) - (a.ad.ctr ?? -Infinity);
      case "freq":
        return (b.ad.frequency ?? -Infinity) - (a.ad.frequency ?? -Infinity);
      case "name":
      default:
        return a.ad.name.localeCompare(b.ad.name);
    }
  });

  // Summary totals for the dashboard strip — computed from filteredAds so it
  // reflects whatever the user is currently looking at (date range, brand,
  // health filter all apply).
  const summary = filteredAds.reduce(
    (acc, { ad }) => {
      acc.spend += ad.spend;
      acc.leads += ad.leads;
      acc.impressions += ad.impressions;
      acc.clicks += ad.clicks;
      if (ad.frequency !== null) {
        acc.freqSum += ad.frequency;
        acc.freqCount += 1;
      }
      return acc;
    },
    { spend: 0, leads: 0, impressions: 0, clicks: 0, freqSum: 0, freqCount: 0 },
  );
  const totalCpl = summary.leads > 0 ? summary.spend / summary.leads : null;
  const totalCtr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : null;
  const avgFreq = summary.freqCount > 0 ? summary.freqSum / summary.freqCount : null;

  const grouped = groupBy(sortedAds, (e) => {
    switch (groupKey) {
      case "brand":
        return e.ad.brandName || "Unknown";
      case "campaign":
        return e.ad.campaignName || "Uncategorized";
      case "health":
        return HEALTH_STYLES[e.health].label;
      case "none":
      default:
        return "__all__";
    }
  });

  const groupKeys = Object.keys(grouped);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Ad Audit
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor and act on live ad performance
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleSyncAll}
            disabled={syncingAll || auditing || brands.length === 0}
            variant="outline"
            size="sm"
          >
            {syncingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {syncingAll ? "Syncing…" : "Sync all data"}
          </Button>
          <Button
            onClick={handleRunAudit}
            disabled={syncingAll || auditing || brands.length === 0}
            variant="outline"
            size="sm"
          >
            {auditing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
            {auditing ? "Running audit…" : "Run audit"}
          </Button>
          <Select
            value={selectedBrand}
            onValueChange={(v) => v && setSelectedBrand(v)}
          >
            <SelectTrigger className="w-56 h-9">
              <SelectValue>
                {selectedBrand === "all"
                  ? "All brands"
                  : brands.find((b) => b.id === selectedBrand)?.name || "Brand"}
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
      </div>

      {status && (
        <div className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
          {status}
        </div>
      )}

      {/* Date range controls */}
      <Card>
        <CardContent className="py-3 flex items-center gap-2 flex-wrap">
          <CalendarIcon className="w-4 h-4 text-gray-400 shrink-0" />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-40 font-mono text-xs"
          />
          <span className="text-xs text-gray-400">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-40 font-mono text-xs"
          />
          <div className="flex gap-1">
            {[7, 14, 30, 90].map((d) => (
              <Button
                key={d}
                onClick={() => setDatePreset(d)}
                variant="ghost"
                size="xs"
              >
                {d}D
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters / sort / group */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 uppercase tracking-wider">
            Health
          </span>
          <Select
            value={healthFilter}
            onValueChange={(v) => v && setHealthFilter(v as AdHealth | "all")}
          >
            <SelectTrigger className="w-32 h-8">
              <SelectValue>
                {healthFilter === "all"
                  ? "All"
                  : HEALTH_STYLES[healthFilter].label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="kill">Kill</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="healthy">Healthy</SelectItem>
              <SelectItem value="winner">Winner</SelectItem>
              <SelectItem value="neutral">No data</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 uppercase tracking-wider">
            Sort
          </span>
          <Select
            value={sortKey}
            onValueChange={(v) => v && setSortKey(v as SortKey)}
          >
            <SelectTrigger className="w-32 h-8">
              <SelectValue>{sortKey}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spend">Spend</SelectItem>
              <SelectItem value="cpl">{displayCostLabel}</SelectItem>
              <SelectItem value="ctr">CTR</SelectItem>
              <SelectItem value="freq">Frequency</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 uppercase tracking-wider">
            Group
          </span>
          <Select
            value={groupKey}
            onValueChange={(v) => v && setGroupKey(v as GroupKey)}
          >
            <SelectTrigger className="w-32 h-8">
              <SelectValue>
                {groupKey === "none" ? "None" : groupKey}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="brand">Brand</SelectItem>
              <SelectItem value="campaign">Campaign</SelectItem>
              <SelectItem value="health">Health</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <span className="text-[11px] text-gray-400 ml-auto font-mono">
          {sortedAds.length} of {ads.length} ads
        </span>
      </div>

      {/* Dashboard summary — totals across filteredAds */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard
          label="Spend"
          value={`RM${summary.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          sub={`${filteredAds.length} ad${filteredAds.length === 1 ? "" : "s"}`}
        />
        <SummaryCard
          label="Leads"
          value={summary.leads.toLocaleString()}
          sub={`across ${filteredAds.length} ad${filteredAds.length === 1 ? "" : "s"}`}
        />
        <SummaryCard
          label={displayCostLabel}
          value={totalCpl !== null ? `RM${totalCpl.toFixed(2)}` : "—"}
          sub="weighted (spend / leads)"
        />
        <SummaryCard
          label="CTR"
          value={totalCtr !== null ? `${totalCtr.toFixed(2)}%` : "—"}
          sub="weighted (clicks / impressions)"
        />
        <SummaryCard
          label="Frequency"
          value={avgFreq !== null ? avgFreq.toFixed(2) : "—"}
          sub={`avg of ${summary.freqCount} ad${summary.freqCount === 1 ? "" : "s"}`}
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : ads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Megaphone className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500">No data for this date range</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupKeys.map((k) => {
            const rows = grouped[k];
            return (
              <div key={k} className="space-y-2">
                {groupKey !== "none" && (
                  <h2 className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">
                    {k} <span className="text-gray-400">({rows.length})</span>
                  </h2>
                )}
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-[11px] text-gray-400 uppercase tracking-wider">
                          <th className="text-left font-medium px-4 py-2">Ad</th>
                          <th className="text-left font-medium px-3 py-2">
                            Status
                          </th>
                          <th className="text-left font-medium px-3 py-2">
                            Health
                          </th>
                          <th className="text-right font-medium px-3 py-2">
                            {displayCostLabel}
                          </th>
                          <th className="text-right font-medium px-3 py-2">
                            CTR
                          </th>
                          <th className="text-right font-medium px-3 py-2">
                            Freq
                          </th>
                          <th className="text-right font-medium px-3 py-2">
                            Spend
                          </th>
                          <th className="text-right font-medium px-3 py-2">
                            Leads
                          </th>
                          <th className="text-right font-medium px-3 py-2">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ ad, health }) => {
                          const hc = HEALTH_STYLES[health];
                          const cl = getCostLabel(ad.brandId);
                          const t = getThresholds(ad.brandId);
                          const cplW =
                            t.cplMax !== null &&
                            ad.cpl !== null &&
                            ad.cpl > t.cplMax;
                          const ctrW =
                            t.ctrMin !== null &&
                            ad.ctr !== null &&
                            ad.ctr < t.ctrMin;
                          const freqW =
                            t.frequencyMax !== null &&
                            ad.frequency !== null &&
                            ad.frequency > t.frequencyMax;
                          const acting = actionLoading === ad.id;

                          return (
                            <tr
                              key={ad.id}
                              className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                            >
                              <td className="px-4 py-2.5">
                                <div
                                  className="font-medium truncate max-w-[240px]"
                                  title={ad.name}
                                >
                                  {ad.name}
                                </div>
                                <div className="text-[11px] text-gray-400 truncate max-w-[240px]">
                                  {ad.brandName && (
                                    <span>{ad.brandName} &middot; </span>
                                  )}
                                  {ad.campaignName || "—"}
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                <Badge
                                  variant={
                                    ad.status === "ACTIVE"
                                      ? "success"
                                      : "secondary"
                                  }
                                >
                                  {ad.status}
                                </Badge>
                              </td>
                              <td className="px-3 py-2.5">
                                <Badge variant={hc.badgeVariant}>
                                  {cl === "CPL" ? hc.label : hc.label}
                                </Badge>
                              </td>
                              <td
                                className={cn(
                                  "text-right px-3 py-2.5 font-mono tabular-nums",
                                  cplW ? "text-red-600" : "text-gray-800",
                                )}
                                title={cl}
                              >
                                {ad.cpl !== null
                                  ? `RM${ad.cpl.toFixed(2)}`
                                  : "—"}
                              </td>
                              <td
                                className={cn(
                                  "text-right px-3 py-2.5 font-mono tabular-nums",
                                  ctrW ? "text-red-600" : "text-gray-800",
                                )}
                              >
                                {ad.ctr !== null
                                  ? `${ad.ctr.toFixed(2)}%`
                                  : "—"}
                              </td>
                              <td
                                className={cn(
                                  "text-right px-3 py-2.5 font-mono tabular-nums",
                                  freqW ? "text-red-600" : "text-gray-800",
                                )}
                              >
                                {ad.frequency !== null
                                  ? ad.frequency.toFixed(1)
                                  : "—"}
                              </td>
                              <td className="text-right px-3 py-2.5 font-mono tabular-nums text-gray-800">
                                RM{ad.spend.toFixed(0)}
                              </td>
                              <td className="text-right px-3 py-2.5 font-mono tabular-nums text-gray-800">
                                {ad.leads}
                              </td>
                              <td className="text-right px-3 py-2.5">
                                {ad.status === "ACTIVE" ? (
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() =>
                                      handleAdAction(ad.id, "pause")
                                    }
                                    disabled={acting}
                                  >
                                    {acting ? (
                                      <Loader2 className="animate-spin" />
                                    ) : (
                                      <Pause />
                                    )}
                                    Pause
                                  </Button>
                                ) : (
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() =>
                                      handleAdAction(ad.id, "activate")
                                    }
                                    disabled={acting}
                                  >
                                    {acting ? (
                                      <Loader2 className="animate-spin" />
                                    ) : (
                                      <Play />
                                    )}
                                    Activate
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string,
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const it of items) {
    const k = keyFn(it);
    if (!out[k]) out[k] = [];
    out[k].push(it);
  }
  return out;
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{label}</p>
        <p className="text-xl font-semibold text-gray-900 mt-0.5 tabular-nums">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
