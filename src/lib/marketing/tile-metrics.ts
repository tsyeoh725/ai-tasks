// Registry of metrics that can show on an ad tile in the Ads tab.
//
// Each brand picks 3-4 keys via brand.config.tileMetrics. The ads page reads
// the registry to render the right value, label, target, and breach state per
// tile cell. Metrics here must be derivable from the columns we already store
// on metaAds + adDailyInsights — anything that needs new sync data (e.g. ROAS,
// purchase value) belongs in Phase B with a schema migration.

export type TileMetricKey =
  | "cost"
  | "ctr"
  | "cpc"
  | "cpm"
  | "frequency"
  | "conversions"
  | "spend"
  | "clicks"
  | "impressions"
  // F-76: ecom-flavoured tiles backed by the new purchase/ATC/value
  // columns synced from Meta's actions[] + action_values[].
  | "purchases"
  | "addToCarts"
  | "roas";

export type TileMetricDirection = "higher-better" | "lower-better" | "neutral";

export type TileMetricInput = {
  cpl: number | null;
  ctr: number | null;
  frequency: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  // F-76: optional so older callers (e.g. a non-purchase brand) compile
  // unchanged. Defaults treated as zero in compute().
  purchases?: number;
  addToCarts?: number;
  purchaseValue?: number;
};

export type BrandThresholds = {
  cplMax: number | null;
  ctrMin: number | null;
  frequencyMax: number | null;
};

export type BrandLike = {
  costMetricLabel: string; // e.g. "CPL", "CPP", "CPC"
  costMetricActionType: string; // e.g. "lead", "purchase", "link_click"
  thresholds: BrandThresholds;
};

export type TileMetricResult = {
  key: TileMetricKey;
  label: string;
  value: number | null;
  /** Display string. Already formatted (currency / %). "—" when value is null. */
  display: string;
  /** Threshold target as display string, or null when no target configured. */
  targetDisplay: string | null;
  direction: TileMetricDirection;
  /** True when the value is on the wrong side of the target. */
  breach: boolean;
};

const RM = (n: number) => `RM${n.toFixed(2)}`;
const RM0 = (n: number) =>
  `RM${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// Map an action_type to a short plural noun for the "leads" footer label and
// the "Conversions" tile. Falls back to a humanized form of the type string.
export function pluralActionLabel(actionType: string | undefined): string {
  if (!actionType) return "conversions";
  const t = actionType.toLowerCase();
  if (t === "lead" || t.endsWith(".lead")) return "leads";
  if (t.includes("purchase")) return "purchases";
  if (t === "link_click") return "link clicks";
  if (t === "landing_page_view") return "page views";
  if (t === "add_to_cart") return "add-to-carts";
  if (t === "initiate_checkout") return "checkouts";
  if (t === "video_view") return "video views";
  if (t.includes("messaging_conversation_started")) return "conversations";
  // Generic fallback: strip leading namespace, replace underscores, pluralize.
  const core = t.replace(/^(onsite_conversion\.|offsite_conversion\.)/, "");
  const human = core.replace(/_/g, " ");
  return human.endsWith("s") ? human : `${human}s`;
}

export type TileMetricDef = {
  key: TileMetricKey;
  /** Static short label used in tile chrome. `cost` overrides this with the brand's costMetric.label. */
  defaultLabel: string;
  longLabel: string;
  description: string;
  direction: TileMetricDirection;
  compute: (ad: TileMetricInput, brand: BrandLike) => TileMetricResult;
};

export const TILE_METRICS: TileMetricDef[] = [
  {
    key: "cost",
    defaultLabel: "Cost",
    longLabel: "Cost per conversion (CPL/CPP/CPC depending on brand)",
    description: "Brand's configured cost metric vs. the threshold maximum.",
    direction: "lower-better",
    compute: (ad, brand) => {
      const v = ad.cpl;
      const target = brand.thresholds.cplMax;
      const breach = target !== null && v !== null && v > target;
      return {
        key: "cost",
        label: brand.costMetricLabel || "Cost",
        value: v,
        display: v !== null ? RM(v) : "—",
        targetDisplay: target !== null ? `≤ ${RM(target)}` : null,
        direction: "lower-better",
        breach,
      };
    },
  },
  {
    key: "ctr",
    defaultLabel: "CTR",
    longLabel: "Click-through rate",
    description: "Clicks ÷ impressions × 100. Higher is better.",
    direction: "higher-better",
    compute: (ad, brand) => {
      const v = ad.ctr;
      const target = brand.thresholds.ctrMin;
      const breach = target !== null && v !== null && v < target;
      return {
        key: "ctr",
        label: "CTR",
        value: v,
        display: v !== null ? `${v.toFixed(2)}%` : "—",
        targetDisplay: target !== null ? `≥ ${target.toFixed(2)}%` : null,
        direction: "higher-better",
        breach,
      };
    },
  },
  {
    key: "cpc",
    defaultLabel: "CPC",
    longLabel: "Cost per link click",
    description: "Spend ÷ clicks. Useful for traffic campaigns.",
    direction: "lower-better",
    compute: (ad) => {
      const v = ad.clicks > 0 ? ad.spend / ad.clicks : null;
      return {
        key: "cpc",
        label: "CPC",
        value: v,
        display: v !== null ? RM(v) : "—",
        targetDisplay: null,
        direction: "lower-better",
        breach: false,
      };
    },
  },
  {
    key: "cpm",
    defaultLabel: "CPM",
    longLabel: "Cost per 1000 impressions",
    description: "Spend ÷ impressions × 1000. Awareness-friendly.",
    direction: "lower-better",
    compute: (ad) => {
      const v = ad.impressions > 0 ? (ad.spend / ad.impressions) * 1000 : null;
      return {
        key: "cpm",
        label: "CPM",
        value: v,
        display: v !== null ? RM(v) : "—",
        targetDisplay: null,
        direction: "lower-better",
        breach: false,
      };
    },
  },
  {
    key: "frequency",
    defaultLabel: "Freq",
    longLabel: "Frequency",
    description: "Average impressions per unique user. Lower avoids fatigue.",
    direction: "lower-better",
    compute: (ad, brand) => {
      const v = ad.frequency;
      const target = brand.thresholds.frequencyMax;
      const breach = target !== null && v !== null && v > target;
      return {
        key: "frequency",
        label: "Freq",
        value: v,
        display: v !== null ? v.toFixed(1) : "—",
        targetDisplay: target !== null ? `≤ ${target.toFixed(1)}` : null,
        direction: "lower-better",
        breach,
      };
    },
  },
  {
    key: "conversions",
    defaultLabel: "Conversions",
    longLabel: "Conversion count (leads / purchases / clicks etc.)",
    description: "Count of the brand's configured action_type events.",
    direction: "higher-better",
    compute: (ad, brand) => {
      const noun = pluralActionLabel(brand.costMetricActionType);
      // Tile labels are short — capitalize first letter, keep up to ~12 chars.
      const label = noun.charAt(0).toUpperCase() + noun.slice(1);
      return {
        key: "conversions",
        label: label.length > 14 ? "Convs" : label,
        value: ad.leads,
        display: compactNumber(ad.leads),
        targetDisplay: null,
        direction: "higher-better",
        breach: false,
      };
    },
  },
  {
    key: "spend",
    defaultLabel: "Spend",
    longLabel: "Spend (RM)",
    description: "Total spend in the selected date range.",
    direction: "neutral",
    compute: (ad) => ({
      key: "spend",
      label: "Spend",
      value: ad.spend,
      display: RM0(ad.spend),
      targetDisplay: null,
      direction: "neutral",
      breach: false,
    }),
  },
  {
    key: "clicks",
    defaultLabel: "Clicks",
    longLabel: "Link clicks",
    description: "Total clicks in the selected date range.",
    direction: "higher-better",
    compute: (ad) => ({
      key: "clicks",
      label: "Clicks",
      value: ad.clicks,
      display: compactNumber(ad.clicks),
      targetDisplay: null,
      direction: "higher-better",
      breach: false,
    }),
  },
  {
    key: "impressions",
    defaultLabel: "Impr",
    longLabel: "Impressions",
    description: "Total impressions in the selected date range.",
    direction: "higher-better",
    compute: (ad) => ({
      key: "impressions",
      label: "Impr",
      value: ad.impressions,
      display: compactNumber(ad.impressions),
      targetDisplay: null,
      direction: "higher-better",
      breach: false,
    }),
  },
  // F-76: standalone ecom metrics. These read the dedicated
  // purchase / add_to_cart / purchase_value columns the sync now
  // populates from actions[] + action_values[], so they work
  // regardless of which action_type the brand chose as its cost
  // metric (a lead-gen brand can still surface purchase totals).
  {
    key: "purchases",
    defaultLabel: "Purch",
    longLabel: "Purchases (count)",
    description: "Count of `purchase` action_type events from Meta.",
    direction: "higher-better",
    compute: (ad) => {
      const v = ad.purchases ?? 0;
      return {
        key: "purchases",
        label: "Purch",
        value: v,
        display: compactNumber(v),
        targetDisplay: null,
        direction: "higher-better",
        breach: false,
      };
    },
  },
  {
    key: "addToCarts",
    defaultLabel: "ATC",
    longLabel: "Add-to-cart count",
    description: "Count of `add_to_cart` action_type events from Meta.",
    direction: "higher-better",
    compute: (ad) => {
      const v = ad.addToCarts ?? 0;
      return {
        key: "addToCarts",
        label: "ATC",
        value: v,
        display: compactNumber(v),
        targetDisplay: null,
        direction: "higher-better",
        breach: false,
      };
    },
  },
  {
    key: "roas",
    defaultLabel: "ROAS",
    longLabel: "Return on ad spend",
    description:
      "Purchase value ÷ spend. Higher is better. Needs purchase value to be tracked on the pixel/CAPI.",
    direction: "higher-better",
    compute: (ad) => {
      const value = ad.purchaseValue ?? 0;
      const v = ad.spend > 0 && value > 0 ? value / ad.spend : null;
      return {
        key: "roas",
        label: "ROAS",
        value: v,
        // ROAS is conventionally shown as "3.42x" — no currency symbol.
        display: v !== null ? `${v.toFixed(2)}x` : "—",
        targetDisplay: null,
        direction: "higher-better",
        breach: false,
      };
    },
  },
];

export const TILE_METRICS_BY_KEY: Record<TileMetricKey, TileMetricDef> =
  Object.fromEntries(TILE_METRICS.map((m) => [m.key, m])) as Record<
    TileMetricKey,
    TileMetricDef
  >;

export const DEFAULT_TILE_METRICS: TileMetricKey[] = [
  "cost",
  "ctr",
  "frequency",
];

// When a brand has no tileMetrics configured but does have a costMetric set,
// pick a sensible default based on whether it's a lead-gen, ecom, traffic, or
// awareness-style action_type. Saves the user from editing settings just to
// get sane defaults.
export function inferTileMetrics(actionType: string | undefined): TileMetricKey[] {
  const t = (actionType ?? "").toLowerCase();
  if (t.includes("purchase") || t === "add_to_cart" || t === "initiate_checkout") {
    // Ecom: cost-per-purchase, conversion count, CPM (audience reach signal).
    return ["cost", "conversions", "frequency"];
  }
  if (t === "link_click" || t === "landing_page_view") {
    // Traffic: CPC, CTR, frequency.
    return ["cpc", "ctr", "frequency"];
  }
  if (t === "video_view") {
    return ["cost", "ctr", "frequency"];
  }
  if (t.includes("messaging_conversation_started")) {
    return ["cost", "conversions", "ctr"];
  }
  // Lead-gen + everything else.
  return DEFAULT_TILE_METRICS;
}

export function resolveTileMetrics(
  configuredKeys: string[] | undefined,
  actionType: string | undefined,
): TileMetricKey[] {
  if (configuredKeys && configuredKeys.length > 0) {
    const valid = configuredKeys.filter(
      (k): k is TileMetricKey => k in TILE_METRICS_BY_KEY,
    );
    if (valid.length > 0) return valid;
  }
  return inferTileMetrics(actionType);
}
