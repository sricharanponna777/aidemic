// Shared cache backed by Upstash Redis (REST, not the TCP protocol -- works
// from serverless/edge functions as well as long-running servers). Server-only.

import { Redis } from '@upstash/redis';

const read = (name: string) => (process.env[name] || '').trim();

let warned = false;

/**
 * `null` when Redis is not configured -- local dev without an Upstash database,
 * or a deploy that has not had the variables added yet. Callers treat that as
 * "cache disabled", never "fail": a missing cache must not break the request
 * it would have sped up. Reads env vars fresh each call rather than caching a
 * client instance -- this is a REST client (no connection to keep warm), and
 * re-reading keeps behavior consistent if the environment changes between
 * calls (e.g. in tests).
 */
const getRedisClient = (): Redis | null => {
  const url = read('UPSTASH_REDIS_REST_URL');
  const token = read('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) {
    if (!warned) {
      console.warn('[redis] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not set -- caching disabled.');
      warned = true;
    }
    return null;
  }

  return new Redis({ url, token });
};

/**
 * Cache-aside: return the cached value under `key` if present, otherwise call
 * `fn`, cache its result for `ttlSeconds`, and return it. Any Redis failure
 * (unconfigured, network error, malformed cached value) falls back to calling
 * `fn` directly -- the cache is a speed optimization, never a dependency the
 * request can fail on.
 */
export async function getOrSetCache<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const redis = getRedisClient();
  if (!redis) return fn();

  try {
    const cached = await redis.get<T>(key);
    if (cached !== null && cached !== undefined) return cached;
  } catch (err) {
    console.error('[redis] get failed, bypassing cache', err);
  }

  const value = await fn();

  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (err) {
    console.error('[redis] set failed, result was not cached', err);
  }

  return value;
}
