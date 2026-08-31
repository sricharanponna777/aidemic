import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkIpRateLimit, getClientIp } from './ipRateLimit';

const withHeaders = (headers: Record<string, string>) => new Request('https://example.test/api/auth', { headers });

beforeEach(() => {
  // Keep every test on the in-memory path, whatever the developer's .env.local holds.
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getClientIp', () => {
  it('takes the address the trusted proxy observed, not the client-supplied one', () => {
    vi.stubEnv('RATE_LIMIT_TRUSTED_PROXY_HOPS', '1');
    // A client that forges "1.1.1.1" still gets bucketed by the real address the
    // proxy appended on the right.
    const request = withHeaders({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' });
    expect(getClientIp(request)).toBe('203.0.113.9');
  });

  it('counts back one more entry for each additional trusted hop', () => {
    vi.stubEnv('RATE_LIMIT_TRUSTED_PROXY_HOPS', '2');
    const request = withHeaders({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9, 10.0.0.5' });
    expect(getClientIp(request)).toBe('203.0.113.9');
  });

  it('falls back to a shared bucket rather than a forged entry on a short header', () => {
    vi.stubEnv('RATE_LIMIT_TRUSTED_PROXY_HOPS', '2');
    // Only one entry, but two proxies were expected: everything present is forgeable.
    const request = withHeaders({ 'x-forwarded-for': '1.1.1.1' });
    expect(getClientIp(request)).toBe('unknown');
  });

  it('ignores forwarded headers entirely when no proxy is trusted', () => {
    vi.stubEnv('RATE_LIMIT_TRUSTED_PROXY_HOPS', '0');
    const request = withHeaders({ 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2' });
    expect(getClientIp(request)).toBe('unknown');
  });

  it('uses x-real-ip when x-forwarded-for is absent', () => {
    vi.stubEnv('RATE_LIMIT_TRUSTED_PROXY_HOPS', '1');
    expect(getClientIp(withHeaders({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
  });

  it('returns unknown when neither header is present', () => {
    vi.stubEnv('RATE_LIMIT_TRUSTED_PROXY_HOPS', '1');
    expect(getClientIp(withHeaders({}))).toBe('unknown');
  });
});

describe('checkIpRateLimit (in-memory fallback)', () => {
  it('allows up to the limit and rejects the next hit', async () => {
    const key = `test:${Math.random()}`;
    expect(await checkIpRateLimit(key, 3, 60_000)).toBe(true);
    expect(await checkIpRateLimit(key, 3, 60_000)).toBe(true);
    expect(await checkIpRateLimit(key, 3, 60_000)).toBe(true);
    expect(await checkIpRateLimit(key, 3, 60_000)).toBe(false);
  });

  it('counts each key independently', async () => {
    const a = `test:${Math.random()}`;
    const b = `test:${Math.random()}`;
    expect(await checkIpRateLimit(a, 1, 60_000)).toBe(true);
    expect(await checkIpRateLimit(a, 1, 60_000)).toBe(false);
    expect(await checkIpRateLimit(b, 1, 60_000)).toBe(true);
  });

  it('starts a fresh window once the old one has elapsed', async () => {
    vi.useFakeTimers();
    try {
      const key = `test:${Math.random()}`;
      expect(await checkIpRateLimit(key, 1, 1_000)).toBe(true);
      expect(await checkIpRateLimit(key, 1, 1_000)).toBe(false);
      vi.advanceTimersByTime(1_001);
      expect(await checkIpRateLimit(key, 1, 1_000)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
