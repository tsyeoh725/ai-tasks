"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Megaphone,
  Loader2,
  Pause,
  Play,
  Calendar as CalendarIcon,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Minus,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  TILE_METRICS_BY_KEY,
  pluralActionLabel,
  resolveTileMetrics,
  type TileMetricKey,
  type BrandLike,
  type TileMetricInput,
} from "@/lib/marketing/tile-metrics";

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
  // F-76: ecom counters / value backing the new tile metrics. Default
  // to 0 client-side; older rows that haven't been resynced post-0011
  // will read 0 until the next pull repopulates them.
  purchases: number;
  addToCarts: number;
  purchaseValue: number;
  metaAdId: string;
  brandId: string;
  brandName?: string;
  // adSetId / campaignId carried so the detail dialog's "Open in Meta
  // Ads Manager" link can deep-link with selected_campaign_ids /
  // selected_adset_ids in addition to selected_ad_ids — Meta uses these
  // to populate the breadcrumb path so the user lands inside the ad's
  // campaign instead of a flat ads list.
  adSetId?: string;
  adSetName?: string;
  campaignId?: string;
  campaignName?: string;
};

type BrandData = {
  id: string;
  name: string;
  // metaAccountId required for the Meta Ads Manager deep link (`act=`).
  metaAccountId: string;
  config: {
    thresholds: {
      cplMax: number | null;
      ctrMin: number | null;
      frequencyMax: number | null;
    };
    costMetric?: { label: string; actionType: string };
    tileMetrics?: string[];
  };
};

type AdHealth = "kill" | "warning" | "healthy" | "winner" | "neutral";
type Thresholds = BrandData["config"]["thresholds"];

function getAdHealth(ad: AdData, t: Thresholds): AdHealth {
  // F-06: previously returned "NO DATA" whenever a brand had no thresholds
  // configured, which buckets every running ad into neutral even when it has
  // real spend, leads, and a clean CPL. The new policy:
  //
  //   1. If we have NO performance data at all (no spend, impressions,
  //      clicks, or leads), it really is NO DATA. Keep "neutral".
  //   2. If we have data but no thresholds, default to "healthy" — the ad is
  //      delivering, we just don't have a target to grade it against. The
  //      "configure thresholds" prompt belongs in the brand settings, not on
  //      every ad tile.
  //   3. With thresholds present, run the original kill/warning/winner logic.
  const hasAnyData =
    ad.spend > 0 ||
    ad.impressions > 0 ||
    ad.clicks > 0 ||
    ad.leads > 0;
  if (!hasAnyData) return "neutral";

  const hasThresholds = !!(t.cplMax || t.ctrMin || t.frequencyMax);
  if (!hasThresholds) return "healthy";

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
  return "healthy";
}

function brandLikeFrom(brand: BrandData | undefined, fallbackLabel: string): BrandLike {
  return {
    costMetricLabel: brand?.config.costMetric?.label || fallbackLabel,
    costMetricActionType: brand?.config.costMetric?.actionType || "lead",
    thresholds: brand?.config.thresholds || {
      cplMax: null,
      ctrMin: null,
      frequencyMax: null,
    },
  };
}

function tileMetricInputFrom(ad: AdData): TileMetricInput {
  return {
    cpl: ad.cpl,
    ctr: ad.ctr,
    frequency: ad.frequency,
    spend: ad.spend,
    impressions: ad.impressions,
    clicks: ad.clicks,
    leads: ad.leads,
    // F-76: pass through the ecom counters / value so the new tile
    // metrics (purchases / addToCarts / roas) can compute.
    purchases: ad.purchases,
    addToCarts: ad.addToCarts,
    purchaseValue: ad.purchaseValue,
  };
}

const HEALTH_STYLES: Record<
  AdHealth,
  {
    label: string;
    badgeVariant:
      | "destructive"
      | "warning"
      | "success"
      | "secondary"
      | "default";
    edge: string; // left-edge accent on tile
    accent: string; // soft tint background
    dot: string; // small dot color used in tile header
  }
> = {
  kill: {
    label: "KILL",
    badgeVariant: "destructive",
    edge: "before:bg-red-500",
    accent: "bg-red-50/50 dark:bg-red-950/20",
    dot: "bg-red-500",
  },
  warning: {
    label: "WARNING",
    badgeVariant: "warning",
    edge: "before:bg-amber-500",
    accent: "bg-amber-50/50 dark:bg-amber-950/20",
    dot: "bg-amber-500",
  },
  healthy: {
    label: "HEALTHY",
    badgeVariant: "success",
    edge: "before:bg-emerald-400",
    accent: "",
    dot: "bg-emerald-500",
  },
  winner: {
    label: "WINNER",
    badgeVariant: "success",
    edge: "before:bg-emerald-500",
    accent: "bg-emerald-50/60 dark:bg-emerald-950/25",
    dot: "bg-emerald-500",
  },
  neutral: {
    label: "NO DATA",
    badgeVariant: "secondary",
    edge: "before:bg-slate-300 dark:before:bg-white/15",
    accent: "",
    dot: "bg-slate-400",
  },
};

function daysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split("T")[0];
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

type SortKey = "spend" | "cpl" | "ctr" | "freq" | "name";
type GroupKey = "none" | "brand" | "campaign" | "health";
type TileCols = 3 | 4 | 5 | 6;

const FILTER_STORAGE_KEY = "ads:filters:v1";

// F-78: tile density. Tailwind needs the literal class strings present
// at build time, so we map each density choice to a static class. Up
// to lg (≥1024px) the grid stays at 3 cols regardless of choice — at
// that width 4+ tiles per row are already too narrow to read. The
// chosen density only kicks in at xl/2xl screens where there's room.
const TILE_COL_CLASS: Record<TileCols, string> = {
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  5: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
  6: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6",
};

export default function AdsPage() {
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [ads, setAds] = useState<AdData[]>([]);
  const [brands, setBrands] = useState<BrandData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [healthFilter, setHealthFilter] = useState<AdHealth | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [groupKey, setGroupKey] = useState<GroupKey>("none");
  // F-78: per-row tile count, persisted across sessions.
  const [tileCols, setTileCols] = useState<TileCols>(4);
  const [syncingAll, setSyncingAll] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [detailAd, setDetailAd] = useState<AdData | null>(null);

  // Hydrate filter state from sessionStorage / URL after mount. Order:
  // URL > sessionStorage > defaults. Fixes SSR mismatch from window/Date in
  // the initializer and restores filters on intra-session navigation.
  useEffect(() => {
    let brandFromUrl: string | null = null;
    try {
      brandFromUrl = new URLSearchParams(window.location.search).get("brand");
    } catch {
      // ignore
    }

    let saved: Partial<{
      selectedBrand: string;
      dateFrom: string;
      dateTo: string;
      healthFilter: AdHealth | "all";
      sortKey: SortKey;
      groupKey: GroupKey;
      tileCols: TileCols;
    }> = {};
    try {
      const raw = window.sessionStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {
      // ignore
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration from URL/sessionStorage on mount; not a subscription
    setSelectedBrand(brandFromUrl ?? saved.selectedBrand ?? "all");
    setDateFrom(saved.dateFrom ?? daysAgo(30));
    setDateTo(saved.dateTo ?? todayISO());
    if (saved.healthFilter) setHealthFilter(saved.healthFilter);
    if (saved.sortKey) setSortKey(saved.sortKey);
    if (saved.groupKey) setGroupKey(saved.groupKey);
    // Validate the saved tile-cols against the allowed set — anything
    // else (a hand-edited storage value, an old build's enum) silently
    // falls back to the default rather than producing an invalid grid.
    if (saved.tileCols && [3, 4, 5, 6].includes(saved.tileCols)) {
      setTileCols(saved.tileCols);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          selectedBrand,
          dateFrom,
          dateTo,
          healthFilter,
          sortKey,
          groupKey,
          tileCols,
        }),
      );
    } catch {
      // ignore
    }
  }, [
    hydrated,
    selectedBrand,
    dateFrom,
    dateTo,
    healthFilter,
    sortKey,
    groupKey,
    tileCols,
  ]);

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
          purchases: (ad.purchases as number) || 0,
          addToCarts: (ad.addToCarts as number) || 0,
          purchaseValue: (ad.purchaseValue as number) || 0,
          metaAdId: ad.metaAdId as string,
          brandId: ad.brandId as string,
          brandName: (ad.brandName as string | null) ?? undefined,
          adSetId: (ad.adSetId as string | null) ?? undefined,
          adSetName: (ad.adSetName as string | null) ?? undefined,
          campaignId: (ad.campaignId as string | null) ?? undefined,
          campaignName: (ad.campaignName as string | null) ?? undefined,
        })),
      );
    } catch {
      // noop
    }
    setLoading(false);
  }, [selectedBrand, dateFrom, dateTo]);

  useEffect(() => {
    if (!hydrated) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/dep change; not migrating to Suspense
    fetchData();
  }, [fetchData, hydrated]);

  function setDatePreset(days: number) {
    setDateFrom(daysAgo(days));
    setDateTo(todayISO());
  }

  async function handleSyncAll() {
    if (syncingAll) return;
    setSyncingAll(true);
    setStatus(null);
    const total = brands.length;
    let queued = 0;
    let failed = 0;
    await Promise.all(
      brands.map(async (b) => {
        try {
          const res = await fetch("/api/meta/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brandId: b.id }),
          });
          if (res.ok || res.status === 202) queued++;
          else failed++;
        } catch {
          failed++;
        }
      }),
    );
    setStatus(
      `Queued ${queued}/${total} brand sync${queued === 1 ? "" : "s"} in the background${failed ? ` — ${failed} failed to queue` : ""}. Watch the status badge.`,
    );
    setSyncingAll(false);
  }

  async function handleRunAudit() {
    if (auditing) return;
    setAuditing(true);
    setStatus(null);
    let queued = false;
    try {
      const res = await fetch("/api/cron/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      queued = res.ok || res.status === 202;
    } catch {
      queued = false;
    }
    setStatus(
      queued
        ? "Audit queued in the background — watch the status badge for completion."
        : "Failed to queue audit — try again.",
    );
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
          (data.new_status as string) ||
          (action === "pause" ? "PAUSED" : "ACTIVE");
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

  function getThresholds(bid: string): Thresholds {
    return (
      brands.find((b) => b.id === bid)?.config?.thresholds || {
        cplMax: null,
        ctrMin: null,
        frequencyMax: null,
      }
    );
  }
  function getCostLabel(bid: string): string | null {
    return brands.find((b) => b.id === bid)?.config?.costMetric?.label || null;
  }

  // F-55: keep the cost-metric label stable even when data is empty or the
  // brand list is still loading. Falling back to a hard-coded "CPL" caused
  // the header to flip from "CPMC" → "CPL" → "CPMC" between renders for a
  // brand whose configured metric was CPMC. Now we hold the last known good
  // value in a ref so the label never appears to change because of empty
  // data alone.
  const lastCostLabelRef = useRef<string>("Cost");
  const computedCostLabel =
    selectedBrand !== "all"
      ? getCostLabel(selectedBrand)
      : brands[0]
        ? getCostLabel(brands[0].id)
        : null;
  if (computedCostLabel) lastCostLabelRef.current = computedCostLabel;
  const displayCostLabel = lastCostLabelRef.current;

  // Conversion-count noun for the summary "Leads" tile. Single-brand view
  // uses that brand's plural action ("purchases", "link clicks"). All-brands
  // view falls back to the generic "Conversions" since the bucket mixes
  // different action_types.
  const summaryConversionLabel = (() => {
    if (selectedBrand === "all") return "Conversions";
    const brand = brands.find((b) => b.id === selectedBrand);
    const noun = pluralActionLabel(brand?.config.costMetric?.actionType);
    return noun.charAt(0).toUpperCase() + noun.slice(1);
  })();

  const adsWithHealth = ads.map((ad) => ({
    ad,
    health: getAdHealth(ad, getThresholds(ad.brandId)),
  }));

  const healthCounts = adsWithHealth.reduce(
    (acc, entry) => {
      acc[entry.health] = (acc[entry.health] || 0) + 1;
      return acc;
    },
    {} as Record<AdHealth, number>,
  );

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
  const totalCtr =
    summary.impressions > 0
      ? (summary.clicks / summary.impressions) * 100
      : null;
  const avgFreq =
    summary.freqCount > 0 ? summary.freqSum / summary.freqCount : null;

  // Threshold ratio bars on summary tiles only make sense when a single brand
  // is selected — across "All brands" each ad has its own targets.
  const summaryThresholds: Thresholds | null =
    selectedBrand !== "all" ? getThresholds(selectedBrand) : null;

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

  // F-77 (revised): grouping by campaign keeps a single outer header
  // per campaign with a continuous 4-col tile grid beneath. The
  // first revision split each campaign into one row per ad set,
  // which looked broken when an ad set had only one ad — a lone tile
  // sitting in three columns of dead space. Ad set membership is now
  // surfaced on the tile itself (subtitle line) so the campaign /
  // ad set / ad hierarchy is still readable without forcing
  // wasteful row breaks. We still sort campaign-grouped ads by ad
  // set name FIRST (then the user's chosen sort) so tiles from the
  // same ad set cluster together visually.
  const campaignBlocks: Array<{
    campaign: string;
    rows: typeof sortedAds;
  }> = groupKey === "campaign"
    ? groupKeys.map((campaign) => {
        const rows = [...grouped[campaign]].sort((a, b) => {
          const aSet = a.ad.adSetName || "";
          const bSet = b.ad.adSetName || "";
          if (aSet === bSet) return 0;
          return aSet.localeCompare(bSet);
        });
        return { campaign, rows };
      })
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-5 animate-fade-in">
      {/* Header — title + brand selector + dates + actions on one row */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
            Ad Audit
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor and act on live ad performance
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(() => {
            // F-54: surface a clear validation message when From > To. The
            // existing inputs accepted the inverted range silently, returning
            // empty data and confusing the user. We render the input row in
            // a wrapper that shows the warning underneath.
            const rangeInverted = Boolean(
              dateFrom && dateTo && dateFrom > dateTo,
            );
            return (
              <div>
                <div
                  className={
                    "flex items-center gap-1.5 rounded-xl border bg-white dark:bg-white/5 px-2 h-9 " +
                    (rangeInverted
                      ? "border-red-400 dark:border-red-500"
                      : "border-gray-200 dark:border-white/10")
                  }
                >
                  <CalendarIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <Input
                    type="date"
                    value={dateFrom}
                    // F-54: cap the From input's `max` to dateTo so the date
                    // picker itself prevents picking a later "from" date.
                    max={dateTo || undefined}
                    onChange={(e) => setDateFrom(e.target.value)}
                    aria-invalid={rangeInverted}
                    className="w-32 font-mono text-xs h-7 border-0 bg-transparent shadow-none px-1 focus-visible:ring-0"
                  />
                  <span className="text-xs text-gray-400">→</span>
                  <Input
                    type="date"
                    value={dateTo}
                    // F-54: cap the To input's `min` to dateFrom for the
                    // reverse direction.
                    min={dateFrom || undefined}
                    onChange={(e) => setDateTo(e.target.value)}
                    aria-invalid={rangeInverted}
                    className="w-32 font-mono text-xs h-7 border-0 bg-transparent shadow-none px-1 focus-visible:ring-0"
                  />
                  <div className="flex gap-0.5 ml-1 border-l border-gray-200 dark:border-white/10 pl-1">
                    {[7, 30, 90].map((d) => (
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
                </div>
                {rangeInverted && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 ml-2">
                    From date is after To date — pick a valid range.
                  </p>
                )}
              </div>
            );
          })()}

          <Select
            value={selectedBrand}
            onValueChange={(v) => v && setSelectedBrand(v)}
          >
            <SelectTrigger className="w-48 h-9">
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

          <Button
            onClick={handleSyncAll}
            disabled={syncingAll || auditing || brands.length === 0}
            variant="outline"
            size="sm"
          >
            {syncingAll ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {syncingAll ? "Syncing…" : "Sync"}
          </Button>
          <Button
            onClick={handleRunAudit}
            disabled={syncingAll || auditing || brands.length === 0}
            size="sm"
          >
            {auditing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5" />
            )}
            {auditing ? "Auditing…" : "Run audit"}
          </Button>
        </div>
      </div>

      {status && (
        <div className="text-xs text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 rounded-xl px-3 py-2">
          {status}
        </div>
      )}

      {/* Summary tiles — five rounded cards with optional threshold bars */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryTile label="Spend" value={`RM${formatNumber(summary.spend)}`} />
        <SummaryTile
          label={summaryConversionLabel}
          value={summary.leads.toLocaleString()}
        />
        <SummaryTile
          label={displayCostLabel}
          value={totalCpl !== null ? `RM${totalCpl.toFixed(2)}` : "—"}
          ratio={
            summaryThresholds?.cplMax && totalCpl !== null
              ? { value: totalCpl, target: summaryThresholds.cplMax, lowerIsBetter: true }
              : null
          }
        />
        <SummaryTile
          label="CTR"
          value={totalCtr !== null ? `${totalCtr.toFixed(2)}%` : "—"}
          ratio={
            summaryThresholds?.ctrMin && totalCtr !== null
              ? { value: totalCtr, target: summaryThresholds.ctrMin, lowerIsBetter: false }
              : null
          }
        />
        <SummaryTile
          label="Frequency"
          value={avgFreq !== null ? avgFreq.toFixed(2) : "—"}
          ratio={
            summaryThresholds?.frequencyMax && avgFreq !== null
              ? { value: avgFreq, target: summaryThresholds.frequencyMax, lowerIsBetter: true }
              : null
          }
        />
      </div>

      {/* Filter row — health chips on the left, sort/group on the right */}
      <div className="flex items-center gap-2 flex-wrap">
        <HealthChip
          label="All"
          count={adsWithHealth.length}
          active={healthFilter === "all"}
          onClick={() => setHealthFilter("all")}
        />
        <HealthChip
          label="Kill"
          count={healthCounts.kill || 0}
          tone="kill"
          active={healthFilter === "kill"}
          onClick={() => setHealthFilter("kill")}
        />
        <HealthChip
          label="Warning"
          count={healthCounts.warning || 0}
          tone="warning"
          active={healthFilter === "warning"}
          onClick={() => setHealthFilter("warning")}
        />
        <HealthChip
          label="Healthy"
          count={healthCounts.healthy || 0}
          tone="healthy"
          active={healthFilter === "healthy"}
          onClick={() => setHealthFilter("healthy")}
        />
        <HealthChip
          label="Winner"
          count={healthCounts.winner || 0}
          tone="winner"
          active={healthFilter === "winner"}
          onClick={() => setHealthFilter("winner")}
        />
        <HealthChip
          label="No data"
          count={healthCounts.neutral || 0}
          tone="neutral"
          active={healthFilter === "neutral"}
          onClick={() => setHealthFilter("neutral")}
        />

        <div className="ml-auto flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">
              Sort
            </span>
            <Select
              value={sortKey}
              onValueChange={(v) => v && setSortKey(v as SortKey)}
            >
              <SelectTrigger className="w-28 h-8">
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
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">
              Group
            </span>
            <Select
              value={groupKey}
              onValueChange={(v) => v && setGroupKey(v as GroupKey)}
            >
              <SelectTrigger className="w-28 h-8">
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
          {/* F-78: tile density picker. Renders as a small segmented
              control next to Sort/Group rather than a dropdown — at
              4 options the click-vs-pick tradeoff favours direct
              buttons, matches the existing "7D / 30D / 90D" pattern
              in the date row, and saves a click on every change. */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">
              Tiles
            </span>
            <div className="inline-flex items-center rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 overflow-hidden">
              {([3, 4, 5, 6] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTileCols(n)}
                  className={cn(
                    "h-8 px-2.5 text-xs font-medium transition-colors border-l first:border-l-0 border-gray-200 dark:border-white/10",
                    tileCols === n
                      ? "bg-[#99ff33]/20 text-gray-900 dark:text-white"
                      : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10",
                  )}
                  aria-pressed={tileCols === n}
                  title={`${n} tiles per row on wide screens`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <span className="text-[11px] text-gray-400 font-mono">
            {sortedAds.length} of {ads.length}
          </span>
        </div>
      </div>

      {/* Tile grid */}
      {loading ? (
        <div className={cn("grid gap-4", TILE_COL_CLASS[tileCols])}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-44 rounded-2xl bg-gray-100 dark:bg-white/5 animate-pulse"
            />
          ))}
        </div>
      ) : ads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Megaphone className="w-12 h-12 text-gray-300 dark:text-white/20 mb-3" />
            <p className="text-muted-foreground">No data for this date range</p>
          </CardContent>
        </Card>
      ) : sortedAds.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Megaphone className="w-12 h-12 text-gray-300 dark:text-white/20 mb-3" />
            <p className="text-muted-foreground">
              No ads match the current filter
            </p>
          </CardContent>
        </Card>
      ) : groupKey === "campaign" ? (
        // F-77 (revised): one campaign header per group, then a single
        // continuous tile grid. Ads are clustered by ad set via the
        // pre-sort above; each tile labels its own ad set in the
        // subtitle so the user can still trace tile → ad set without
        // the layout collapsing into 1-tile rows.
        <div className="space-y-6">
          {campaignBlocks.map(({ campaign, rows }) => (
            <div key={campaign} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-xs uppercase tracking-wider text-gray-700 dark:text-gray-200 font-semibold">
                  {campaign}
                </h2>
                <span className="text-[11px] text-gray-400 font-mono">
                  {rows.length}
                </span>
                <span className="flex-1 h-px bg-gray-200 dark:bg-white/10" />
              </div>
              <div className={cn("grid gap-4", TILE_COL_CLASS[tileCols])}>
                {rows.map(({ ad, health }) => (
                  <AdTile
                    key={ad.id}
                    ad={ad}
                    health={health}
                    brand={brands.find((b) => b.id === ad.brandId)}
                    isActing={actionLoading === ad.id}
                    onAction={handleAdAction}
                    onOpen={() => setDetailAd(ad)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {groupKeys.map((k) => {
            const rows = grouped[k];
            return (
              <div key={k} className="space-y-3">
                {groupKey !== "none" && (
                  <div className="flex items-center gap-2">
                    <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                      {k}
                    </h2>
                    <span className="text-[11px] text-gray-400 font-mono">
                      {rows.length}
                    </span>
                    <span className="flex-1 h-px bg-gray-200 dark:bg-white/10" />
                  </div>
                )}
                <div className={cn("grid gap-4", TILE_COL_CLASS[tileCols])}>
                  {rows.map(({ ad, health }) => (
                    <AdTile
                      key={ad.id}
                      ad={ad}
                      health={health}
                      brand={brands.find((b) => b.id === ad.brandId)}
                      isActing={actionLoading === ad.id}
                      onAction={handleAdAction}
                      onOpen={() => setDetailAd(ad)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AdDetailDialog
        ad={detailAd}
        onClose={() => setDetailAd(null)}
        thresholds={detailAd ? getThresholds(detailAd.brandId) : null}
        costLabel={(detailAd ? getCostLabel(detailAd.brandId) : "CPL") ?? "CPL"}
        health={
          detailAd
            ? getAdHealth(detailAd, getThresholds(detailAd.brandId))
            : null
        }
        accountId={
          detailAd
            ? brands.find((b) => b.id === detailAd.brandId)?.metaAccountId ?? null
            : null
        }
      />
    </div>
  );
}

function AdTile({
  ad,
  health,
  brand,
  isActing,
  onAction,
  onOpen,
}: {
  ad: AdData;
  health: AdHealth;
  brand: BrandData | undefined;
  isActing: boolean;
  onAction: (id: string, action: "pause" | "activate") => void;
  onOpen: () => void;
}) {
  const hc = HEALTH_STYLES[health];
  const isActive = ad.status === "ACTIVE";
  const brandLike = brandLikeFrom(brand, "CPL");
  const adInput = tileMetricInputFrom(ad);
  const metricKeys = resolveTileMetrics(
    brand?.config.tileMetrics,
    brand?.config.costMetric?.actionType,
  );
  const cells = metricKeys.map((k) =>
    TILE_METRICS_BY_KEY[k].compute(adInput, brandLike),
  );
  const footerNoun = pluralActionLabel(brand?.config.costMetric?.actionType);
  const footerNounSingular = footerNoun.endsWith("s")
    ? footerNoun.slice(0, -1)
    : footerNoun;
  const gridColsClass =
    cells.length === 4
      ? "grid-cols-4"
      : cells.length === 2
        ? "grid-cols-2"
        : cells.length === 1
          ? "grid-cols-1"
          : "grid-cols-3";

  return (
    <div
      onClick={onOpen}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#141814] p-4 cursor-pointer",
        "transition-all duration-150",
        "hover:border-[#99ff33]/60 dark:hover:border-[#99ff33]/40 hover:shadow-[0_4px_20px_rgb(153_255_51/0.12)]",
        "before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:rounded-l-2xl",
        hc.edge,
        hc.accent,
      )}
    >
      {/* Top row: health pill + action */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn("size-1.5 rounded-full shrink-0", hc.dot)}
            aria-hidden
          />
          <Badge variant={hc.badgeVariant}>{hc.label}</Badge>
          <Badge variant={isActive ? "outline" : "secondary"}>
            {ad.status}
          </Badge>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAction(ad.id, isActive ? "pause" : "activate");
          }}
          disabled={isActing}
          className={cn(
            "shrink-0 inline-flex items-center justify-center size-7 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300 transition-colors",
            "hover:bg-gray-50 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white",
            "disabled:opacity-50 disabled:pointer-events-none",
          )}
          title={isActive ? "Pause ad" : "Activate ad"}
        >
          {isActing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isActive ? (
            <Pause className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Name + breadcrumb. F-77 (revised v2): the ad set used to live
          on the same line as brand · campaign; on a typical card
          width the breadcrumb truncates before reaching the ad set,
          so the new info was effectively invisible. Now the ad set
          gets its own dedicated line below the brand · campaign
          subtitle with its own truncate behaviour, so it's always
          visible regardless of how long the campaign name is. */}
      <div className="mb-4">
        <h3
          className="font-semibold text-gray-900 dark:text-white text-[15px] leading-snug line-clamp-2"
          title={ad.name}
        >
          {ad.name}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {ad.brandName ? <span>{ad.brandName} · </span> : null}
          {ad.campaignName || "—"}
        </p>
        {ad.adSetName && (
          <p
            className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate"
            title={ad.adSetName}
          >
            <span className="text-gray-400 dark:text-gray-500">Ad set · </span>
            {ad.adSetName}
          </p>
        )}
      </div>

      {/* Brand-configured metric strip (registry-driven). */}
      <div className={cn("grid gap-2 mb-3", gridColsClass)}>
        {cells.map((cell) => (
          <TileMetricCell key={cell.key} cell={cell} />
        ))}
      </div>

      {/* Footer: spend / conversion-count, with conversion noun derived from
          brand.costMetric.actionType (e.g. "purchases", "link clicks"). */}
      <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-gray-100 dark:border-white/10 pt-3 -mx-4 px-4">
        <span className="font-mono tabular-nums text-gray-700 dark:text-gray-300">
          RM{formatNumber(ad.spend)}{" "}
          <span className="text-gray-400">spent</span>
        </span>
        <span className="font-mono tabular-nums text-gray-700 dark:text-gray-300">
          {ad.leads.toLocaleString()}{" "}
          <span className="text-gray-400">
            {ad.leads === 1 ? footerNounSingular : footerNoun}
          </span>
        </span>
      </div>
    </div>
  );
}

function TileMetricCell({
  cell,
}: {
  cell: ReturnType<
    (typeof TILE_METRICS_BY_KEY)[TileMetricKey]["compute"]
  >;
}) {
  const Glyph =
    cell.targetDisplay === null
      ? Minus
      : cell.direction === "lower-better"
        ? TrendingUp
        : TrendingDown;
  // F-56: full text on hover for truncated values, so users can read the
  // whole figure (e.g. "RM17,234.50") without resizing the card.
  return (
    <div
      className="rounded-xl bg-gray-50 dark:bg-white/5 px-2.5 py-2 min-w-0"
      title={`${cell.label}: ${cell.display}${cell.targetDisplay ? ` (target ${cell.targetDisplay})` : ""}`}
    >
      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium truncate">
        {cell.label}
      </p>
      <p
        className={cn(
          "text-base font-semibold tabular-nums mt-0.5 truncate",
          cell.breach
            ? "text-red-600 dark:text-red-400"
            : "text-gray-900 dark:text-white",
        )}
      >
        {cell.display}
      </p>
      <div className="flex items-center gap-1 mt-1">
        <Glyph
          className={cn(
            "w-3 h-3 shrink-0",
            cell.breach
              ? "text-red-500"
              : cell.targetDisplay === null
                ? "text-gray-300 dark:text-white/20"
                : "text-emerald-500",
          )}
        />
        <span className="text-[10px] text-gray-400 truncate font-mono">
          {cell.targetDisplay ?? "no target"}
        </span>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  ratio,
}: {
  label: string;
  value: string;
  ratio?: {
    value: number;
    target: number;
    lowerIsBetter: boolean;
  } | null;
}) {
  let bar: { pct: number; over: boolean } | null = null;
  if (ratio && ratio.target > 0) {
    const raw = (ratio.value / ratio.target) * 100;
    const pct = Math.max(0, Math.min(100, raw));
    const over = ratio.lowerIsBetter ? raw > 100 : raw < 100;
    bar = { pct, over };
  }
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#141814] p-4 transition-all hover:border-[#99ff33]/60 dark:hover:border-[#99ff33]/40 hover:shadow-[0_4px_20px_rgb(153_255_51/0.10)]">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </p>
      <p className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mt-1 tabular-nums truncate">
        {value}
      </p>
      {bar ? (
        <div className="mt-3">
          <div className="h-1 w-full bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                bar.over ? "bg-red-400" : "bg-[#99ff33]",
              )}
              style={{ width: `${bar.pct}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-1 font-mono truncate">
            target {ratio!.lowerIsBetter ? "≤" : "≥"}{" "}
            {ratio!.target.toFixed(2)}
          </p>
        </div>
      ) : (
        <div className="mt-3 h-1 w-full" aria-hidden />
      )}
    </div>
  );
}

// Build a Meta Ads Manager deep-link that lands on the specific ad with
// the right account context. `act=` is required — without it Meta opens
// whichever account the user last viewed (often nothing they have access
// to). Adding selected_campaign_ids / selected_adset_ids populates the
// breadcrumb path so the user arrives inside the ad's campaign + adset
// rather than a flat ads grid. metaAccountId is stored as the bare
// numeric id per the brand-create form (placeholder "e.g. 123456789"),
// but defensively strip an `act_` prefix if one slipped in.
function buildMetaAdsManagerUrl(
  accountId: string | null,
  adId: string,
  campaignId?: string,
  adSetId?: string,
): string {
  if (!accountId) {
    // Fallback to old behaviour — at least scope by ad id.
    return `https://www.facebook.com/adsmanager/manage/ads?selected_ad_ids=${adId}`;
  }
  const act = accountId.replace(/^act_/, "");
  const params = new URLSearchParams({ act, selected_ad_ids: adId });
  if (campaignId) params.set("selected_campaign_ids", campaignId);
  if (adSetId) params.set("selected_adset_ids", adSetId);
  return `https://www.facebook.com/adsmanager/manage/ads?${params.toString()}`;
}

function AdDetailDialog({
  ad,
  onClose,
  thresholds,
  costLabel,
  health,
  accountId,
}: {
  ad: AdData | null;
  onClose: () => void;
  thresholds: Thresholds | null;
  costLabel: string;
  health: AdHealth | null;
  accountId: string | null;
}) {
  const open = ad !== null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="truncate">{ad?.name ?? ""}</DialogTitle>
          <DialogDescription>
            {ad?.brandName && <span>{ad.brandName} &middot; </span>}
            {ad?.campaignName || "—"}
            {ad?.adSetName && (
              <>
                {" "}
                &middot; <span className="text-gray-500">{ad.adSetName}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {ad && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={ad.status === "ACTIVE" ? "success" : "secondary"}>
                {ad.status}
              </Badge>
              {health && (
                <Badge variant={HEALTH_STYLES[health].badgeVariant}>
                  {HEALTH_STYLES[health].label}
                </Badge>
              )}
            </div>

            {/* Performance: the three graded metrics that drive health.
                Surfaced first and visually weightier so the operator
                sees the diagnostic vital signs (against their targets)
                before the raw counters. */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                Performance
              </div>
              <div className="grid grid-cols-3 gap-2">
                <DetailStat
                  label={costLabel}
                  value={ad.cpl !== null ? `RM${ad.cpl.toFixed(2)}` : "—"}
                  hint={
                    thresholds?.cplMax
                      ? `target ≤ RM${thresholds.cplMax.toFixed(2)}`
                      : undefined
                  }
                />
                <DetailStat
                  label="CTR"
                  value={ad.ctr !== null ? `${ad.ctr.toFixed(2)}%` : "—"}
                  hint={
                    thresholds?.ctrMin
                      ? `target ≥ ${thresholds.ctrMin.toFixed(2)}%`
                      : ad.impressions < 100
                        ? "needs ≥100 impressions"
                        : undefined
                  }
                />
                <DetailStat
                  label="Frequency"
                  value={
                    ad.frequency !== null ? ad.frequency.toFixed(2) : "—"
                  }
                  hint={
                    thresholds?.frequencyMax
                      ? `target ≤ ${thresholds.frequencyMax.toFixed(2)}`
                      : undefined
                  }
                />
              </div>
            </div>

            {/* Volume: raw counters, compact. No targets to grade
                against — these are context for the performance numbers
                above. 4-up on sm+ avoids the orphan-tile look the
                previous 3-col layout produced with 7 stats. */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                Volume
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <CompactStat
                  label="Spend"
                  value={`RM${ad.spend.toFixed(2)}`}
                />
                <CompactStat
                  label="Leads"
                  value={ad.leads.toLocaleString()}
                />
                <CompactStat
                  label="Impressions"
                  value={ad.impressions.toLocaleString()}
                />
                <CompactStat
                  label="Clicks"
                  value={ad.clicks.toLocaleString()}
                />
              </div>
            </div>

            {ad.metaAdId && (
              <div className="pt-2 border-t border-gray-200 dark:border-white/10">
                <a
                  href={buildMetaAdsManagerUrl(
                    accountId,
                    ad.metaAdId,
                    ad.campaignId,
                    ad.adSetId,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-600 dark:text-indigo-300 hover:underline"
                >
                  Open this ad in Meta Ads Manager &rarr;
                </a>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </p>
      <p className="text-base font-semibold text-gray-900 dark:text-white mt-0.5 tabular-nums">
        {value}
      </p>
      {hint && (
        <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
      )}
    </div>
  );
}

// Compact volume tile — same visual language as DetailStat but tighter
// padding and smaller value text so a 4-up row reads as a supporting
// strip rather than competing with the graded performance trio above.
function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </p>
      <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5 tabular-nums truncate">
        {value}
      </p>
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

function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function HealthChip({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone?: "kill" | "warning" | "healthy" | "winner" | "neutral";
  active: boolean;
  onClick: () => void;
}) {
  const base =
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border";

  if (tone === undefined) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          base,
          active
            ? "bg-indigo-100 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-900 text-indigo-800 dark:text-indigo-200"
            : "bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10",
        )}
      >
        {label}
        <span
          className={cn(
            "text-[10px] tabular-nums",
            active
              ? "text-indigo-600 dark:text-indigo-300"
              : "text-gray-400",
          )}
        >
          {count}
        </span>
      </button>
    );
  }

  const toneStyles = {
    kill: {
      activeBg:
        "bg-red-100 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300",
      hover: "hover:bg-red-50 dark:hover:bg-red-950/20 hover:border-red-200",
    },
    warning: {
      activeBg:
        "bg-amber-100 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300",
      hover: "hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:border-amber-200",
    },
    healthy: {
      activeBg:
        "bg-emerald-100 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300",
      hover:
        "hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:border-emerald-200",
    },
    winner: {
      activeBg:
        "bg-blue-100 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300",
      hover: "hover:bg-blue-50 dark:hover:bg-blue-950/20 hover:border-blue-200",
    },
    neutral: {
      activeBg:
        "bg-slate-200 dark:bg-white/15 border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200",
      hover: "hover:bg-slate-100 dark:hover:bg-white/10 hover:border-slate-200",
    },
  } as const;

  const style = toneStyles[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        base,
        active
          ? style.activeBg
          : `bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 ${style.hover}`,
      )}
    >
      {label}
      <span className="text-[10px] tabular-nums opacity-70">{count}</span>
    </button>
  );
}
