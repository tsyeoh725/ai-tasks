// Next.js instrumentation hook. Called once when the server starts.
// We use it to kick off background schedulers (ad monitor cron, weekly report cron).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production" && !process.env.ENABLE_CRON_DEV) return;

  const { startSchedulers } = await import("@/lib/marketing/scheduler");
  startSchedulers();
}

// F-05: Capture server-side errors so we can identify the origin of the 5xx
// responses observed on RSC prefetches (sidebar routes returned 503 on hover,
// direct nav worked). Without this hook the cause is lost — only the status
// reaches the browser. One dense log line per failure is enough to grep for
// patterns (which routes, whether the failures correlate with the RSC header,
// whether they're rate-limited).
type RequestErrorContext = {
  routerKind: "Pages Router" | "App Router";
  routePath: string;
  routeType: "render" | "route" | "action" | "middleware";
};

type RequestInfo = {
  path: string;
  method: string;
  headers: { [key: string]: string };
};

export function onRequestError(
  err: unknown,
  request: RequestInfo,
  context: RequestErrorContext
) {
  const e = err as { message?: string; stack?: string; digest?: string } | undefined;
  console.error(
    "[onRequestError]",
    JSON.stringify({
      method: request.method,
      path: request.path,
      rsc: request.headers["rsc"] || request.headers["RSC"] || null,
      next_router_prefetch: request.headers["next-router-prefetch"] || null,
      router: context.routerKind,
      route: context.routePath,
      type: context.routeType,
      digest: e?.digest,
      message: e?.message,
    })
  );
  if (e?.stack) console.error(e.stack);
}
