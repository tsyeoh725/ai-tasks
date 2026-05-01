// Next.js instrumentation hook. Called once when the server starts.
// We use it to kick off background schedulers (ad monitor cron, weekly report cron).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production" && !process.env.ENABLE_CRON_DEV) return;

  const { startSchedulers } = await import("@/lib/marketing/scheduler");
  startSchedulers();
}
