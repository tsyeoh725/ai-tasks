# Ads tab redesign — tile layout

**File:** `src/app/(app)/ads/page.tsx` (1126 lines, single file — no API/data changes needed)
**Goal:** Replace the 9-column dense table with a scannable tile grid that surfaces health at a glance, while keeping every action and metric the current page has.

---

## What's wrong now

- 9-column table with 11px uppercase headers — eye has to track across the row to connect ad name → CPL → action.
- Five horizontal stat tiles + chip filters live in one Card sitting *above* the table, so you scroll past the totals to reach what you act on.
- Health badge is a small pill in column 3; it's the most important signal but reads like metadata.
- Page is gray-on-white only — no use of the Edge Point lime (`#99ff33`) accent the rest of the app leans on (see `clients/[id]/page.tsx` hover glow).
- Dialog detail (line 884) is decent — keep it, just open from tiles instead of rows.

---

## New layout (top → bottom)

### 1. Header strip — keep, tighten
- Title `Ad Audit` + subtitle, brand selector, `Sync all data`, `Run audit` — same as today (lines 459–507).
- Move the date range + presets (`7D 14D 30D 90D`) onto the header line, right of the brand selector. One row, fewer breaks.

### 2. Summary row — turn the metric strip into 5 large tiles
Replace the `CompactMetric` row (lines 603–621) with five rounded-2xl cards that each include a tiny sparkline-style ratio bar showing **value vs. brand threshold** when one exists:

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ SPEND       │ │ LEADS       │ │ CPL         │ │ CTR         │ │ FREQUENCY   │
│ RM12,480    │ │ 86          │ │ RM 145.12   │ │ 2.34%       │ │ 1.8         │
│ 30 days     │ │ 30 days     │ │ ▓▓▓░░ vs RM200│ │ ▓▓▓▓░ vs 1.5%│ │ ▓▓░░░ vs 3.0│
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

Card style mirrors the rest of the app: `rounded-2xl bg-white border border-gray-200 p-5 hover:border-[#99ff33]/60 hover:shadow-[0_4px_20px_rgb(153_255_51/0.12)] transition-all`. Threshold bar uses brand thresholds when `selectedBrand !== "all"`; falls back to no bar otherwise.

### 3. Health filter row — bigger, color-coded
Keep the existing `HealthChip` (lines 1044–1125) — it already maps to the right tones. Move it out of the metric Card onto its own line so chips read as the **filter control** they are. Add an explicit Sort + Group cluster on the right of the same row.

### 4. The grid — the centerpiece
Replace the table (lines 694–862) with a CSS grid of **ad tiles**. Recommended breakpoints:

```
grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4
```

**Per-tile anatomy (≈ 200px tall):**

```
┌──────────────────────────────────────────┐
│ ◉ KILL                       ⏸ Pause  ⋮  │ ← health pill (color = ring) + action
├──────────────────────────────────────────┤
│ Summer launch — variant B                │ ← ad.name (clamp-2)
│ Acme Corp · Conversions Q3               │ ← brandName · campaignName
├──────────────────────────────────────────┤
│   CPL          CTR          FREQ          │
│   RM 248       1.1%         3.4           │
│   ▲ over       ▼ under      ▲ over        │ ← red when threshold breached
├──────────────────────────────────────────┤
│ RM 2,180 spent · 12 leads · ACTIVE        │ ← compact footer
└──────────────────────────────────────────┘
```

**Tile styling rules:**
- Base: `rounded-2xl border bg-white p-4 flex flex-col gap-3 cursor-pointer`
- Health = **left-edge accent bar** *and* badge: `kill` → `border-l-4 border-l-red-500` and `ring-1 ring-red-400/30 bg-red-50/40`; `winner` → `border-l-4 border-l-emerald-500 ring-1 ring-emerald-400/40 bg-emerald-50/50`; `warning` amber; `healthy` subtle emerald tint; `neutral` plain. Reuse the existing `HEALTH_STYLES` map (line 105) — extend each entry with a `border` field instead of duplicating.
- Hover: `hover:border-[#99ff33]/60 hover:shadow-[0_4px_20px_rgb(153_255_51/0.12)] transition-all` — Edge Point lime, matches `clients/[id]/page.tsx:1206`.
- Click anywhere on tile → opens `AdDetailDialog` (already exists, reuse unchanged).
- Pause/Activate button stays on the tile, top-right; `e.stopPropagation()` so it doesn't open the dialog (same trick as line 820).

**Metric mini-grid inside the tile (the 3-column row):**
- Three equal columns: `grid grid-cols-3 gap-2`.
- Each cell: tiny uppercase label (10px), big mono value (18px), and a directional `▲`/`▼` glyph in red when the value breaches that brand's threshold (`cplW`, `ctrW`, `freqW` already computed at lines 731–742 — lift this logic into a helper).
- Spend + Leads + Status get a single one-liner at the bottom (less prominent because they don't drive the kill/keep decision).

### 5. Group headers — keep
When `groupKey !== "none"`, render the same `<h2>` (line 690) above each tile sub-grid. No structural change, just becomes a section heading above a grid instead of above a table.

### 6. Empty + loading states
- Loading: replace the centered spinner with a 6-tile skeleton grid (`h-44 rounded-2xl bg-gray-100 animate-pulse`).
- Empty: keep the current Megaphone Card but wrap it in `rounded-2xl` to match.

---

## Implementation steps (single PR, single file)

1. **Lift two helpers to module scope** so the tile component can be a pure subcomponent:
   - `getThresholdBreaches(ad, thresholds)` → `{ cplW, ctrW, freqW }` (extract from lines 731–742).
   - Extend `HEALTH_STYLES` (line 105) with `border` (left-edge color) and `accent` (subtle bg tint) keys.

2. **Add `<AdTile />` component** at the bottom of the file (next to `CompactMetric`, line 1027). Props: `{ ad, health, costLabel, thresholds, isActing, onAction, onOpen }`. Self-contained, no hooks beyond what's passed in.

3. **Replace the `<table>` block** (lines 694–862) with the grid mapping `rows.map((entry) => <AdTile … />)`. Group header logic stays as is.

4. **Beef up the metric strip** (lines 603–621):
   - Replace `CompactMetric` with `<SummaryTile />` (new, sibling component) that includes the optional threshold bar.
   - Threshold bar: `<div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden"><div style={{width: pct}} className="h-full bg-[#99ff33]" /></div>` — clamp `pct` to 0–100%, color flips to red-400 when value > threshold for "lower-is-better" metrics (CPL, frequency).

5. **Move the date range** (lines 519–545) into the header row beside the brand selector. The dedicated toolbar row then only carries Sort + Group + the result count, OR collapses entirely — verify in the browser.

6. **Pull the health chip row** out of the summary Card (lines 622–667) into a standalone `flex items-center gap-2 flex-wrap` row directly above the grid.

7. **Skeleton loader**: replace the spinner block (lines 672–675) with a 6-element pulse grid that matches the tile dimensions.

8. **No API change required.** `/api/meta-ads`, `/api/meta/sync`, `/api/cron/monitor`, `/api/meta-ads/action` all stay untouched. SSR-stable filter hydration logic (lines 178–229) is unchanged.

9. **Manual verify in browser** before merge:
   - All five health buckets render with correct ring + accent colors.
   - Pause/Activate doesn't open the detail dialog.
   - Clicking the tile body does open it.
   - Threshold breaches show the red `▲`/`▼` glyph.
   - Group-by Brand / Campaign / Health still produces correct sections.
   - Mobile (one column) reads cleanly — no overflow on long ad names.
   - Dark mode (`dark:` class) — tiles still legible. Card already uses `bg-card` semantics via shadcn `<Card>` so use the same primitive instead of raw `bg-white` if you want dark-mode parity for free.

---

## What changes vs. what's untouched

| Area | Verdict |
|---|---|
| `AdDetailDialog` (884–987) | **Keep as is** — already matches the new aesthetic |
| Health classification (`getAdHealth`, 66–103) | **Keep** — pure logic, untouched |
| Filter / sort / group state + persistence (151–229) | **Keep** — already solid |
| API calls (231–361) | **Keep** — no shape changes |
| `HEALTH_STYLES` map | **Extend** with `border` + `accent` keys |
| Table → tile grid (694–862) | **Rewrite** |
| Metric strip + chips + toolbar (515–669) | **Restructure into 3 cleaner rows** |
| New `<AdTile>`, `<SummaryTile>` | **Add** |

---

## Risk / nits

- Tiles take more vertical space than table rows → at >50 ads, scrolling gets long. **Mitigation:** the existing Sort/Group + health filter chips already handle this; don't over-engineer pagination unless it actually hurts.
- Threshold bar on "all brands" view has no anchor (each ad has its own brand thresholds). **Decision:** show the bar only when `selectedBrand !== "all"`. With "All brands" selected, the summary tiles drop the bar and show just label + value.
- Dark mode: current page hard-codes `bg-white`, `text-gray-*`, `border-gray-200`. The redesign is a chance to switch to shadcn `<Card>` + `text-foreground` / `text-muted-foreground` so dark mode works without a second pass — recommend doing it now while we're rewriting the markup anyway.
