import { createClient } from '@/lib/supabase-client';

/**
 * Browser-side cache of AI responses, keyed by the signed-in user and the
 * exact request. Asking for the same thing twice returns the stored answer
 * without calling the model (or spending the daily AI allowance).
 *
 * Only cache a route whose response is the whole effect of the call. A route
 * that also writes to the database -- flashcard generation creates a deck,
 * transcription and paper/assignment marking persist rows, podcast generation
 * stores audio -- must keep calling the server, or a cache hit would skip the
 * write and hand back an id for something that was never created (or has
 * since been deleted).
 *
 * Entries live until they are overwritten or the user signs out (useAuth
 * calls clearAiCache on SIGNED_OUT). The user id is part of every key, so on a
 * shared computer one student can never be served another's results.
 */

const PREFIX = 'aidemic-ai-cache:';

type Entry = { savedAt: number; value: unknown };

/** cyrb53: a fast 53-bit string hash. Synchronous, unlike crypto.subtle, which
 *  is also missing outside a secure context (e.g. dev over a LAN address). */
const hash = (text: string): string => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

/** The storage key for this request, or null when nobody is signed in (in
 *  which case nothing is cached). `scope` is the endpoint the request goes to. */
export const aiCacheKey = async (scope: string, request: unknown): Promise<string | null> => {
  try {
    const { data } = await createClient().auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return null;
    return `${PREFIX}${userId}:${scope}:${hash(JSON.stringify(request))}`;
  } catch {
    return null;
  }
};

export const readAiCache = <T>(key: string): T | null => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return (JSON.parse(raw) as Entry).value as T;
  } catch {
    return null;
  }
};

const cacheKeys = (): string[] => {
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  return keys;
};

/** Store a value. When localStorage is full, the oldest cached responses are
 *  evicted -- never anything outside this cache -- until it fits. */
export const writeAiCache = (key: string, value: unknown): void => {
  let serialized: string;
  try {
    serialized = JSON.stringify({ savedAt: Date.now(), value } satisfies Entry);
  } catch {
    return;
  }

  try {
    window.localStorage.setItem(key, serialized);
    return;
  } catch {
    // Quota exceeded (or storage blocked entirely) -- try making room below.
  }

  try {
    const byAge = cacheKeys()
      .filter((candidate) => candidate !== key)
      .map((candidate) => {
        try {
          return { key: candidate, savedAt: (JSON.parse(window.localStorage.getItem(candidate) ?? '') as Entry).savedAt };
        } catch {
          return { key: candidate, savedAt: 0 };
        }
      })
      .sort((a, b) => a.savedAt - b.savedAt);

    for (const entry of byAge) {
      window.localStorage.removeItem(entry.key);
      try {
        window.localStorage.setItem(key, serialized);
        return;
      } catch {
        // Still too big; evict the next oldest.
      }
    }
  } catch {
    // Storage unavailable (private mode, blocked site data): run uncached.
  }
};

/** Remove every cached AI response, for every user. */
export const clearAiCache = (): void => {
  try {
    for (const key of cacheKeys()) window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable: nothing was cached.
  }
};

/**
 * POST `request` as JSON to `url`, unless this user has already made exactly
 * this request, in which case the stored response is returned instead. Only
 * successful responses are stored, so an error is always retried for real.
 *
 * Returns a Response either way, so it drops in where `fetch` was.
 */
export const cachedAiFetch = async (url: string, request: unknown): Promise<Response> => {
  const key = await aiCacheKey(url, request);
  if (key) {
    const cached = readAiCache<unknown>(key);
    if (cached !== null) {
      return new Response(JSON.stringify(cached), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (key && response.ok) {
    try {
      // An `xp` award is the one part of a marking response that is an effect
      // rather than an answer. Replayed from the cache it would announce XP the
      // server never paid, so it is never stored: a hit returns the marks only.
      const body: unknown = await response.clone().json();
      if (body && typeof body === 'object' && !Array.isArray(body) && 'xp' in body) {
        const rest: Record<string, unknown> = { ...body };
        delete rest.xp;
        writeAiCache(key, rest);
      } else {
        writeAiCache(key, body);
      }
    } catch {
      // Not JSON: hand it back uncached.
    }
  }
  return response;
};
