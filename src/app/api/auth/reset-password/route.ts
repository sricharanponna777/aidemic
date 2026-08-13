import { NextResponse } from 'next/server';
import { tryCreateAdminClient } from '@/lib/supabase-admin';
import {
  buildPasswordResetData,
  getEmailServerConfig,
  missingEmailEnv,
  sendTemplateEmail,
} from '@/lib/email';
import { checkIpRateLimit, getClientIp } from '@/lib/ipRateLimit';

/**
 * Sends the password-reset email through Brevo rather than Supabase's built-in
 * mailer, so it carries AIDemic's branding and every link is absolute against
 * APP_URL instead of whichever origin the browser happened to be on -- which is
 * what used to put a localhost URL in a real user's inbox.
 *
 * Supabase still owns the token: generateLink() mints a recovery token hash
 * without sending anything, and /auth/confirm redeems it. Nothing here is a
 * home-grown reset token.
 *
 * Always answers ok: true for a well-formed request. Distinguishing a known
 * from an unknown address would turn this into an account-existence oracle.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) {
      return NextResponse.json({ error: 'An email address is required.' }, { status: 400 });
    }

    // generateLink() is an admin call, so it bypasses the per-IP throttle
    // Supabase applies to /auth/v1/recover. Both limits are restored here: one
    // against a burst from a single client, one so no single inbox can be
    // mail-bombed from rotating addresses.
    if (
      !checkIpRateLimit(`reset-password:ip:${getClientIp(request)}`, 5, 60_000) ||
      !checkIpRateLimit(`reset-password:email:${email}`, 3, 900_000)
    ) {
      return NextResponse.json(
        { error: 'Too many reset requests. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    const config = getEmailServerConfig();
    if (!config) {
      console.warn(`[email] password-reset skipped: unset ${missingEmailEnv().join(', ')}`);
      return NextResponse.json({ ok: true, skipped: 'email-not-configured' });
    }

    const admin = tryCreateAdminClient();
    if (!admin) {
      console.error('[auth/reset-password] service-role key unavailable; no email sent');
      return NextResponse.json({ ok: true, skipped: 'service-role-unavailable' });
    }

    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
    if (error || !data.properties?.hashed_token || !data.user) {
      // Unknown address, or a Supabase-side failure. Logged, never surfaced.
      console.warn('[auth/reset-password] no link generated:', error?.message ?? 'no token returned');
      return NextResponse.json({ ok: true });
    }

    // Built against APP_URL, not the request origin: the link has to work from
    // an inbox days later, and points at our own domain rather than the
    // project's supabase.co host.
    const resetUrl = new URL('/auth/confirm', `${config.appUrl}/`);
    resetUrl.searchParams.set('token_hash', data.properties.hashed_token);
    resetUrl.searchParams.set('type', 'recovery');
    resetUrl.searchParams.set('next', '/login?mode=reset');

    const { data: profile } = await admin
      .from('user_profiles')
      .select('first_name, full_name, username')
      .eq('id', data.user.id)
      .maybeSingle();

    const result = await sendTemplateEmail({
      to: data.user.email ?? email,
      template: 'password-reset',
      data: buildPasswordResetData({
        resetUrl: resetUrl.toString(),
        firstName:
          profile?.first_name?.trim() ||
          profile?.full_name?.trim().split(' ')[0] ||
          profile?.username?.trim(),
      }),
    });

    // A mailer outage is worth surfacing -- otherwise the user waits on an
    // email that was never sent. It leaks nothing about the address, since an
    // unknown one returns above without ever reaching a send.
    if (!result.ok) {
      return NextResponse.json(
        { error: 'Could not send the reset email. Please try again shortly.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[auth/reset-password] unexpected failure:', err);
    return NextResponse.json({ error: 'Could not send the reset email.' }, { status: 500 });
  }
}
