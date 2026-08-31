import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { redisInstance, RedisCtor } = vi.hoisted(() => {
  const redisInstance = { get: vi.fn(), set: vi.fn() };
  const RedisCtor = vi.fn(function RedisCtor(this: unknown) {
    return redisInstance;
  });
  return { redisInstance, RedisCtor };
});

vi.mock('@upstash/redis', () => ({ Redis: RedisCtor }));

import { getOrSetCache } from './redis';

const ENV_KEYS = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  vi.clearAllMocks();
  redisInstance.get.mockResolvedValue(null);
  redisInstance.set.mockResolvedValue('OK');
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('getOrSetCache', () => {
  it('calls fn directly and never touches Redis when unconfigured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const fn = vi.fn().mockResolvedValue('computed');
    const result = await getOrSetCache('key', 60, fn);

    expect(result).toBe('computed');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(RedisCtor).not.toHaveBeenCalled();
  });

  it('returns the cached value and skips fn on a hit', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    redisInstance.get.mockResolvedValue('cached-value');

    const fn = vi.fn().mockResolvedValue('computed');
    const result = await getOrSetCache('key', 60, fn);

    expect(result).toBe('cached-value');
    expect(fn).not.toHaveBeenCalled();
    expect(redisInstance.set).not.toHaveBeenCalled();
  });

  it('calls fn and stores the result with the given TTL on a miss', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    redisInstance.get.mockResolvedValue(null);

    const fn = vi.fn().mockResolvedValue('computed');
    const result = await getOrSetCache('my-key', 3600, fn);

    expect(result).toBe('computed');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(redisInstance.set).toHaveBeenCalledWith('my-key', 'computed', { ex: 3600 });
  });

  it('falls back to fn when the Redis read fails', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    redisInstance.get.mockRejectedValue(new Error('network down'));

    const fn = vi.fn().mockResolvedValue('computed');
    const result = await getOrSetCache('key', 60, fn);

    expect(result).toBe('computed');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('still returns fn()\'s value when the Redis write fails', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    redisInstance.get.mockResolvedValue(null);
    redisInstance.set.mockRejectedValue(new Error('network down'));

    const fn = vi.fn().mockResolvedValue('computed');
    const result = await getOrSetCache('key', 60, fn);

    expect(result).toBe('computed');
  });
});
