// Sliding-window limiter for unauthenticated endpoints (e.g. /api/auth).
//
// Backed by Upstash Redis when it is configured, so the window is shared across
// every serverless instance -- an in-memory counter only ever limited one lambda
// at a time, which on a platform that scales out per request is close to no limit
// at all. Without Redis it degrades to the old per-process behaviour rather than
// failing: a speed bump on one instance beats none.

import { Redis } from '@upstash/redis';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

let warnedNoRedis = false;

function getRedisClient(): Redis | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url || !token) {
    if (!warnedNoRedis) {
      console.warn('[rateLimit] Upstash not configured -- rate limits are per-instance only.');
      warnedNoRedis = true;
    }
    return null;
  }
  return new Redis({ url, token });
}

/**
 * How many proxies sit in front of the app. `X-Forwarded-For` is a list each proxy
 * appends to, so with one trusted proxy the *last* entry is the address that proxy
 * actually saw and everything to its left is client-supplied and forgeable. Reading
 * the leftmost entry -- what this used to do -- let anyone reset their own limit by
 * sending a fresh `X-Forwarded-For` on every request.
 *
 * Default 1 suits a single reverse proxy or platform edge (Vercel, nginx). Set to 0
 * only when the app is exposed directly, where the header should not be trusted at all.
 */
const trustedProxyHops = (): number => {
  const parsed = Number.parseInt(process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS ?? '1', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
};

/** Client IP as seen by the nearest trusted proxy, or 'unknown' (a shared bucket). */
export function getClientIp(request: Request): string {
  const hops = trustedProxyHops();
  if (hops === 0) return 'unknown';

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    // Count back from the right: parts[length - hops] is the address the outermost
    // trusted proxy observed. Clamped so a short header cannot select a forged entry.
    const index = parts.length - hops;
    if (index >= 0 && parts[index]) return parts[index]!;
  }

  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Per-process fallback, used when Redis is unconfigured or unreachable. */
function checkInMemory(key: string, limit: number, windowMs: number): boolean {
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

/**
 * Returns true if this hit is within the limit, false if it should be rejected.
 * @param key      identifier to throttle on (e.g. `auth:${ip}`)
 * @param limit    max hits allowed within the window
 * @param windowMs window length in milliseconds
 */
export async function checkIpRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return checkInMemory(key, limit, windowMs);

  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  // Fixed window keyed by window number, so the counter and its expiry can never
  // disagree: a new window is a new key rather than a counter that needs resetting.
  const redisKey = `ratelimit:${key}:${Math.floor(Date.now() / windowMs)}`;

  try {
    const count = await redis.incr(redisKey);
    // Only the request that created the key sets the TTL, so a burst cannot keep
    // pushing the expiry out and hold the window open indefinitely.
    if (count === 1) await redis.expire(redisKey, windowSeconds);
    return count <= limit;
  } catch (err) {
    // A Redis outage must not lock every user out of signing in. Falling back to the
    // in-memory window keeps a real (if per-instance) limit rather than none.
    console.error('[rateLimit] Redis check failed, falling back to in-memory window', err);
    return checkInMemory(key, limit, windowMs);
  }
}
