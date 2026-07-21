// Coarse in-memory sliding-window limiter keyed by client IP. Intended as a
// cheap brute-force speed bump on unauthenticated endpoints (e.g. /api/auth).
// State is per-process, so on serverless it protects per-instance rather than
// globally -- good enough as a first line of defence, not a hard quota.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Best-effort client IP from proxy headers, falling back to a shared bucket. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Returns true if this hit is within the limit, false if it should be rejected.
 * @param key      identifier to throttle on (e.g. `auth:${ip}`)
 * @param limit    max hits allowed within the window
 * @param windowMs window length in milliseconds
 */
export function checkIpRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // Opportunistic cleanup so the map can't grow unbounded.
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) {
        if (now >= b.resetAt) buckets.delete(k);
      }
    }
    return true;
  }

  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}
