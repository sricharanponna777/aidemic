import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { sendBulkEmail } from '@/lib/email-mailer';

/**
 * Bulk email endpoint for sending multiple emails at once.
 * Used by the weekly-parent-digest Edge Function.
 *
 * Authorization: requests with x-api-key header matching BULK_EMAIL_SECRET.
 * The endpoint FAILS CLOSED -- with BULK_EMAIL_SECRET unset it answers 503 and
 * sends nothing, in every environment including dev. It used to skip the check
 * entirely when the variable was missing, which meant a deploy that forgot one
 * env var silently exposed an unauthenticated "send mail as AIDemic" endpoint.
 */

// The digest function posts one batch per 100 parents, so 100 is the real
// ceiling rather than an arbitrary one. Both caps bound the work a single
// authenticated request can queue.
const MAX_MESSAGES = 100;
const MAX_BODY_BYTES = 1_000_000;

type BulkMessage = { to: string; template: string; data: Record<string, string> };

/** Constant-time compare that tolerates length mismatch without leaking it via early return. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Deliberately shallow: templates interpolate scalars only, so a nested object or an
 * array in `data` is a malformed message rather than something to coerce. */
function invalidMessageReason(value: unknown, index: number): string | null {
  const at = `messages[${index}]`;
  if (typeof value !== 'object' || value === null) return `${at} must be an object`;
  const msg = value as Record<string, unknown>;
  if (typeof msg.to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.to)) {
    return `${at}.to must be a valid email address`;
  }
  if (typeof msg.template !== 'string' || !/^[a-z0-9-]{1,64}$/.test(msg.template)) {
    return `${at}.template must be a template name`;
  }
  if (typeof msg.data !== 'object' || msg.data === null || Array.isArray(msg.data)) {
    return `${at}.data must be an object`;
  }
  for (const [key, entry] of Object.entries(msg.data)) {
    if (typeof entry !== 'string' && typeof entry !== 'number' && typeof entry !== 'boolean') {
      return `${at}.data.${key} must be a string, number or boolean`;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.BULK_EMAIL_SECRET?.trim();
  if (!secret) {
    console.error('[email/bulk] BULK_EMAIL_SECRET is not set; refusing to send.');
    return NextResponse.json({ error: 'Bulk email is not configured.' }, { status: 503 });
  }
  if (!secretMatches(request.headers.get('x-api-key'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Read as text first so an oversized body is rejected before it is parsed.
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid request: body must be JSON' }, { status: 400 });
    }

    const messages = (body as { messages?: unknown } | null)?.messages;
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request: messages must be an array' }, { status: 400 });
    }
    if (messages.length > MAX_MESSAGES) {
      return NextResponse.json(
        { error: `Invalid request: at most ${MAX_MESSAGES} messages per request` },
        { status: 400 }
      );
    }

    for (let i = 0; i < messages.length; i += 1) {
      const reason = invalidMessageReason(messages[i], i);
      if (reason) return NextResponse.json({ error: `Invalid request: ${reason}` }, { status: 400 });
    }

    const result = await sendBulkEmail({ messages: messages as BulkMessage[] });

    // Match the response format expected by the Edge Function
    const statusCode = result.sent === 0 && result.failed > 0 ? 500 : result.failed > 0 ? 207 : 200;

    return NextResponse.json(
      {
        ok: result.ok,
        total: result.total,
        sent: result.sent,
        failed: result.failed,
        skipped: 0,
        results: result.results.map((r) => ({
          to: [r.to],
          status: r.status,
          ...(r.error ? { error: { code: 'send_failed', message: r.error } } : {}),
        })),
      },
      { status: statusCode }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[email/bulk] error:', message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
