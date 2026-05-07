// ─── Rate limiting (SL-5) ────────────────────────────────────────────────────
// Sliding-window in-memory rate limiter. Keyed by arbitrary string (e.g.
// `submit:<formId>:<ip>` or `register:<ip>`). Memory is bounded — we don't
// persist limits across restarts (which is fine for the single-container
// deployment; restart wipes count, but the attacker also lost their burst
// timing budget).
//
// Why in-memory and not DB-backed: this app runs as a single Docker container.
// A SQLite write per request would add latency and we'd need to GC old rows.
// The bounded Map keeps the working set tiny.

const buckets = new Map<string, number[]>();
const MAX_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Returns true if the key is under the limit (and records the call).
 * Returns false if the key is over the limit (does not record).
 *
 * @param key       Stable identifier — e.g. `submit:${formId}:${ip}` or `register:${ip}`
 * @param windowMs  Sliding window duration in milliseconds
 * @param max       Maximum calls allowed in the window
 */
export function rateLimit(key: string, windowMs: number, max: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const arr = buckets.get(key) || [];
  // Prune entries outside the window in-place.
  const fresh = arr.filter((t) => t >= cutoff);

  if (fresh.length >= max) {
    buckets.set(key, fresh);
    const oldest = fresh[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + windowMs - now),
    };
  }

  fresh.push(now);
  buckets.set(key, fresh);

  // Bound memory. Crude eviction — keep only the most recently inserted
  // MAX_KEYS keys (Map iteration is insertion-ordered).
  if (buckets.size > MAX_KEYS) {
    const entries = Array.from(buckets.entries()).slice(-MAX_KEYS);
    buckets.clear();
    for (const [k, v] of entries) buckets.set(k, v);
  }

  return {
    allowed: true,
    remaining: Math.max(0, max - fresh.length),
    retryAfterMs: 0,
  };
}

/**
 * Extract the client IP from request headers. Cloudflare Tunnel forwards
 * the original IP via X-Forwarded-For. Falls back to a placeholder when
 * the header is missing (local dev, internal network).
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // X-Forwarded-For: client, proxy1, proxy2 → first hop is the original client.
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
