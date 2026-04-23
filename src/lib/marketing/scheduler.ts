import cron from "node-cron";

let started = false;

export function startSchedulers() {
  if (started) return;
  started = true;

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

  console.log(`[cron] schedulers started: monitor=${interval}, weekly=${weekly}`);
}
