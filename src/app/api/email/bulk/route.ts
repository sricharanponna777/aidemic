import { NextRequest, NextResponse } from 'next/server';
import { sendBulkEmail } from '@/lib/email-mailer';

/**
 * Bulk email endpoint for sending multiple emails at once.
 * Used by the weekly-parent-digest Edge Function.
 *
 * Authorization: requests with x-api-key header matching BULK_EMAIL_SECRET.
 * If BULK_EMAIL_SECRET is unset, the endpoint is open (dev mode).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.BULK_EMAIL_SECRET?.trim();
  if (secret && request.headers.get('x-api-key') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      messages: Array<{
        to: string;
        template: string;
        data: Record<string, string>;
      }>;
    };

    if (!Array.isArray(body.messages)) {
      return NextResponse.json({ error: 'Invalid request: messages must be an array' }, { status: 400 });
    }

    const result = await sendBulkEmail({ messages: body.messages });

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
