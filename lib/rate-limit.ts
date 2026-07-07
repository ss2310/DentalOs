import "server-only";

// Best-effort in-memory sliding-window rate limiter.
//
// NOTE: state lives in this server instance's memory, so it resets on
// redeploy / cold start and is NOT shared across instances. On serverless /
// multi-instance hosting it is a speed bump that slows abuse, not a hard
// global guarantee. For a hard cross-instance limit, back this with a shared
// store (e.g. Upstash Redis). It's enough to blunt signup flooding (SEC-H3)
// until that's in place — and it needs no migration / infra.

const buckets = new Map<string, number[]>();

export type RateResult = { ok: boolean; retryAfterMs: number };

/**
 * Records an attempt for `key` and reports whether it's within `limit` per
 * `windowMs`. Timestamps outside the window are dropped on each call.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Opportunistic prune so inactive keys don't leak memory over time.
  if (buckets.size > 10_000) {
    const stale: string[] = [];
    buckets.forEach((v, k) => {
      if (v.length === 0 || v[v.length - 1] <= cutoff) stale.push(k);
    });
    stale.forEach((k) => buckets.delete(k));
  }

  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterMs: Math.max(hits[0] + windowMs - now, 0) };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfterMs: 0 };
}
