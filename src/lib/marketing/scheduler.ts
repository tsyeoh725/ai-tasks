import cron from "node-cron";
import { db } from "@/db";
import { automationSettings, brands, globalSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { runAutomationCycleForBrand } from "@/lib/marketing/automation-runner";

let started = false;

// Per-brand scheduler. The cron tick runs every TICK_CRON minutes (default
// every 5 minutes), looks at every brand with an automation row, and
// triggers a cycle for any brand whose `lastCycleAt` is older than its
// `cadenceHours`. We respect the per-user `global_pause` flag and the
// brand's own `enabled` toggle. Cycles run in series within a tick to
// keep DB / Meta API contention bounded; the operator's tick window is
// almost always small so this is fine.

async function isUserPaused(userId: string): Promise<boolean> {
  const row = await db.query.globalSettings.findFirst({
    where: and(eq(globalSettings.userId, userId), eq(globalSettings.key, "global_pause")),
  });
  if (!row) return false;
  try {
    const parsed = JSON.parse(row.value) as boolean | { value?: boolean };
    return typeof parsed === "boolean" ? parsed : !!parsed?.value;
  } catch {
    return false;
  }
}

async function runDueCycles() {
  const rows = await db.query.automationSettings.findMany({
    where: eq(automationSettings.enabled, true),
  });
  if (rows.length === 0) return;

  // Cache per-user pause checks within this tick so we don't re-query for
  // every brand owned by the same user.
  const userPauseCache = new Map<string, boolean>();

  for (const row of rows) {
    const brand = await db.query.brands.findFirst({ where: eq(brands.id, row.brandId) });
    if (!brand || !brand.isActive) continue;

    let paused = userPauseCache.get(brand.userId);
    if (paused === undefined) {
      paused = await isUserPaused(brand.userId);
      userPauseCache.set(brand.userId, paused);
    }
    if (paused) continue;

    const lastMs = row.lastCycleAt ? row.lastCycleAt.getTime() : 0;
    const dueAt = lastMs + row.cadenceHours * 60 * 60 * 1000;
    if (Date.now() < dueAt) continue;

    try {
      await runAutomationCycleForBrand(brand.id, "scheduled");
      console.log(`[automation] cycle complete brand=${brand.name}`);
    } catch (err) {
      console.error(`[automation] cycle failed brand=${brand.name}:`, err);
    }
  }
}

export function startSchedulers() {
  if (started) return;
  // SL-6: refuse to start the in-process scheduler if CRON_SECRET is unset.
  // Otherwise the safety-net crons fire `x-cron-secret: ""` which the routes
  // reject (correctly) — silently disabling the cron without any signal that
  // the deployment is misconfigured.
  if (!process.env.CRON_SECRET) {
    console.error(
      "[cron] FATAL: CRON_SECRET not set — refusing to start in-process schedulers. Set CRON_SECRET in .env.production to enable monitor + weekly + per-brand automation cycles."
    );
    return;
  }
  started = true;

  // Per-brand scheduling tick. Default every 5 minutes; brands run when
  // their cadenceHours has elapsed since lastCycleAt.
  const tickInterval = process.env.AUTOMATION_TICK_CRON ?? "*/5 * * * *";
  cron.schedule(tickInterval, async () => {
    try {
      await runDueCycles();
    } catch (err) {
      console.error("[automation] tick failed:", err);
    }
  });

  // Legacy global monitor cron — still runs as a safety net so users who
  // haven't enabled per-brand automation aren't broken. Fires the existing
  // cron monitor endpoint with the cron secret.
  const interval = process.env.MONITOR_CRON ?? "0 */6 * * *";
  cron.schedule(interval, async () => {
    try {
      const res = await fetch(`${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/cron/monitor`, {
        method: "POST",
        headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
      });
      console.log("[cron] monitor cycle:", res.status);
    } catch (err) {
      console.error("[cron] monitor failed:", err);
    }
  });

  const weekly = process.env.WEEKLY_CRON ?? "0 9 * * 1";
  cron.schedule(weekly, async () => {
    try {
      const res = await fetch(`${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/cron/weekly`, {
        method: "POST",
        headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
      });
      console.log("[cron] weekly report:", res.status);
    } catch (err) {
      console.error("[cron] weekly failed:", err);
    }
  });

  console.log(`[cron] schedulers started: tick=${tickInterval} monitor=${interval} weekly=${weekly}`);
}
