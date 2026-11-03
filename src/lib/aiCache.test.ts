import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let userId: string | null = 'user-a';
vi.mock('@/lib/supabase-client', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null } }) },
  }),
}));

const { aiCacheKey, cachedAiFetch, clearAiCache, readAiCache, writeAiCache } = await import('./aiCache');

/** A Map-backed localStorage that can be told to refuse writes over a size. */
const makeStorage = (maxChars = Infinity) => {
  const map = new Map<string, string>();
  const used = () => [...map.values()].reduce((sum, value) => sum + value.length, 0);
  return {
    map,
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (used() - (map.get(key)?.length ?? 0) + value.length > maxChars) throw new Error('QuotaExceededError');
      map.set(key, value);
    },
    removeItem: (key: string) => void map.delete(key),
  };
};

const okJson = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });

let storage: ReturnType<typeof makeStorage>;
const fetchMock = vi.fn();

beforeEach(() => {
  userId = 'user-a';
  storage = makeStorage();
  vi.stubGlobal('window', { localStorage: storage });
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cachedAiFetch', () => {
  it('calls the server once and serves the identical request from the cache', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ reply: 'hello' }));

    const first = await cachedAiFetch('/api/ai/study-chat', { concept: 'osmosis' });
    const second = await cachedAiFetch('/api/ai/study-chat', { concept: 'osmosis' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await first.json()).toEqual({ reply: 'hello' });
    expect(second.ok).toBe(true);
    expect(await second.json()).toEqual({ reply: 'hello' });
  });

  it('treats a different request, or a different user, as a miss', async () => {
    fetchMock.mockImplementation(async () => okJson({ reply: 'x' }));

    await cachedAiFetch('/api/ai/study-chat', { concept: 'osmosis' });
    await cachedAiFetch('/api/ai/study-chat', { concept: 'diffusion' });
    userId = 'user-b';
    await cachedAiFetch('/api/ai/study-chat', { concept: 'osmosis' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never caches an error, so the next attempt goes to the server', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'busy' }), { status: 502 }))
      .mockResolvedValueOnce(okJson({ reply: 'ok' }));

    const failed = await cachedAiFetch('/api/ai/blurt-review', { topic: 't' });
    const retried = await cachedAiFetch('/api/ai/blurt-review', { topic: 't' });

    expect(failed.ok).toBe(false);
    expect(await retried.json()).toEqual({ reply: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never replays an XP award from the cache', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ report: { percentage: 80 }, xp: { xpAwarded: 120 } }));

    const first = await cachedAiFetch('/api/ai/mark-answers', { answers: ['a'] });
    const replay = await cachedAiFetch('/api/ai/mark-answers', { answers: ['a'] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await first.json()).xp).toEqual({ xpAwarded: 120 });
    expect(await replay.json()).toEqual({ report: { percentage: 80 } });
  });

  it('caches nothing when nobody is signed in', async () => {
    userId = null;
    fetchMock.mockImplementation(async () => okJson({ reply: 'x' }));

    await cachedAiFetch('/api/ai/study-chat', { concept: 'osmosis' });
    await cachedAiFetch('/api/ai/study-chat', { concept: 'osmosis' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(storage.length).toBe(0);
  });
});

describe('writeAiCache', () => {
  it('evicts the oldest cached entries, and nothing else, when storage is full', async () => {
    storage = makeStorage(400);
    vi.stubGlobal('window', { localStorage: storage });
    storage.setItem('aidemic-theme', 'dark');

    const keys = await Promise.all([1, 2, 3].map((n) => aiCacheKey('/api/ai/x', { n })));
    const [oldest, middle, newest] = keys as string[];
    vi.spyOn(Date, 'now').mockReturnValueOnce(1).mockReturnValueOnce(2).mockReturnValueOnce(3);
    writeAiCache(oldest, 'a'.repeat(100));
    writeAiCache(middle, 'b'.repeat(100));
    writeAiCache(newest, 'c'.repeat(150));

    expect(readAiCache(oldest)).toBeNull();
    expect(readAiCache(middle)).toBe('b'.repeat(100));
    expect(readAiCache(newest)).toBe('c'.repeat(150));
    expect(storage.getItem('aidemic-theme')).toBe('dark');
  });

  it('does not throw when localStorage is unavailable', async () => {
    vi.stubGlobal('window', {
      get localStorage(): never {
        throw new Error('SecurityError');
      },
    });
    expect(() => writeAiCache('aidemic-ai-cache:k', 1)).not.toThrow();
    expect(readAiCache('aidemic-ai-cache:k')).toBeNull();
  });
});

describe('clearAiCache', () => {
  it('removes every cached response and leaves other keys alone', async () => {
    const key = (await aiCacheKey('/api/ai/x', {})) as string;
    writeAiCache(key, { a: 1 });
    storage.setItem('aidemic-theme', 'dark');

    clearAiCache();

    expect(readAiCache(key)).toBeNull();
    expect(storage.getItem('aidemic-theme')).toBe('dark');
  });
});
