// Lightweight per-key rate limiter for Cloud Functions.
//
// Tracks request counts in a process-local Map. The Map persists across
// invocations on the same warm Cloud Run instance (containers stay alive
// for up to ~15 minutes of idle time) and resets on cold start / restart.
//
// Why in-memory and not Firestore-backed:
//   - The threat we're sized for is "one curl loop from one IP", not a
//     distributed botnet. A loose loophole when 50 cold instances all
//     start with empty Maps is acceptable when paired with maxInstances
//     caps and budget alerts.
//   - A Firestore-backed limiter adds 1 read + 1 write per call we want
//     to gate — that's its own cost and latency hit on every legit user.
//   - The size of the Map is bounded by `maxKeysBeforePrune` to avoid
//     memory creep from skewed traffic.
//
// Returns `{ allowed, retryAfterMs }`. Callers throw the appropriate
// HttpsError on `!allowed` with a "resource-exhausted" code.

export interface RateLimiterOptions {
  /** Max requests per window per key. */
  maxPerWindow: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Hard cap on Map size; we prune oldest entries when exceeded. */
  maxKeysBeforePrune?: number;
}

interface Bucket {
  count:    number;
  resetAt:  number;
}

export type RateLimitResult =
  | { allowed: true;  retryAfterMs: 0 }
  | { allowed: false; retryAfterMs: number };

/**
 * Build a rate-limit checker. Hold onto the returned function across
 * invocations — declare it at module scope so warm instances share the
 * underlying Map across requests.
 */
export function createRateLimiter(opts: RateLimiterOptions): (key: string) => RateLimitResult {
  const buckets = new Map<string, Bucket>();
  const maxKeys = opts.maxKeysBeforePrune ?? 10_000;

  return (key: string): RateLimitResult => {
    const now = Date.now();
    const existing = buckets.get(key);

    // Expired or never-seen — start a fresh window.
    if (!existing || now >= existing.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      // Cheap prune: when the map grows past `maxKeys`, drop the oldest
      // entries by `resetAt`. Avoids unbounded growth on skewed traffic.
      if (buckets.size > maxKeys) {
        const oldestKeys = [...buckets.entries()]
          .sort((a, b) => a[1].resetAt - b[1].resetAt)
          .slice(0, Math.floor(maxKeys / 4))
          .map(([k]) => k);
        for (const k of oldestKeys) buckets.delete(k);
      }
      return { allowed: true, retryAfterMs: 0 };
    }

    // Within window — count or deny.
    if (existing.count >= opts.maxPerWindow) {
      return { allowed: false, retryAfterMs: existing.resetAt - now };
    }
    existing.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  };
}

/**
 * Pull a best-effort client IP out of a Firebase v2 callable's raw
 * Express request. Cloud Run sits behind Google's load balancer, so the
 * real client IP arrives as the FIRST entry in `x-forwarded-for`.
 * Falls back to `rawRequest.ip` and finally to a sentinel.
 */
export function extractClientIp(rawRequest: any): string {
  const fwd = rawRequest?.headers?.["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    // x-forwarded-for can have multiple hops; the first is the client.
    return fwd.split(",")[0].trim();
  }
  if (typeof rawRequest?.ip === "string" && rawRequest.ip.length > 0) {
    return rawRequest.ip;
  }
  return "unknown";
}
