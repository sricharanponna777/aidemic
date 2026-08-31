import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

const COOKIE_NAME = 'sb-role-cache';
const TTL_SECONDS = 5 * 60;

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toBase64Url(signature);
}

/**
 * Caches a user's `user_profiles.role` in a short-lived signed cookie so
 * proxy.ts's per-request role check (defense-in-depth only -- RLS is the real
 * backstop) doesn't have to query Postgres on every dashboard navigation.
 * Bound to userId so a different signed-in user always misses the cache.
 * Disabled -- always falls back to the DB query -- unless ROLE_CACHE_SECRET
 * is set, so it's opt-in and safe by default.
 */
export async function readCachedRole(
  request: NextRequest,
  userId: string
): Promise<string | null | undefined> {
  const secret = process.env.ROLE_CACHE_SECRET;
  if (!secret) return undefined;

  const raw = request.cookies.get(COOKIE_NAME)?.value;
  if (!raw) return undefined;

  const parts = raw.split('.');
  if (parts.length !== 4) return undefined;
  const [cookieUserId, roleField, expField, signature] = parts;

  if (cookieUserId !== userId) return undefined;

  const exp = Number(expField);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return undefined;

  const expected = await sign(`${cookieUserId}.${roleField}.${expField}`, secret);
  if (!timingSafeEqual(expected, signature)) return undefined;

  return roleField === 'null' ? null : roleField;
}

export async function writeCachedRole(
  response: NextResponse,
  userId: string,
  role: string | null
): Promise<void> {
  const secret = process.env.ROLE_CACHE_SECRET;
  if (!secret) return;

  const roleField = role ?? 'null';
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${userId}.${roleField}.${exp}`;
  const signature = await sign(payload, secret);

  response.cookies.set(COOKIE_NAME, `${payload}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TTL_SECONDS,
    path: '/',
  });
}
