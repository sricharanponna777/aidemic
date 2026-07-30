import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { tryCreateAdminClient } from '@/lib/supabase-admin';
import { buildWelcomeData, getEmailServerConfig, missingEmailEnv, sendTemplateEmail } from '@/lib/email';
import { isMailerConfigured } from '@/lib/email-mailer';

/**
 * Sends the post-signup welcome email, at most once per account.
 *
 * Takes no body: signup happens in the browser, so the client is not a source of
 * truth for who you are or which role you picked. Every value that reaches the
 * template is re-read from user_profiles under the authenticated caller's id.
 *
 * The `welcome_email_sent_at IS NULL` claim is what makes a replayed request a
 * no-op instead of a second email, and it doubles as the read -- the UPDATE
 * returns the row, so the whole send path is one round trip.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Checked BEFORE the claim on purpose: an unconfigured environment must
    // leave welcome_email_sent_at null so the email still goes out once the
    // variables are set, rather than being permanently burned.
    if (!isMailerConfigured() || !getEmailServerConfig()) {
      console.warn(`[email] welcome skipped: unset ${missingEmailEnv().join(', ')}`);
      return NextResponse.json({ ok: true, skipped: 'email-not-configured' });
    }

    const admin = tryCreateAdminClient();
    if (!admin) return NextResponse.json({ ok: true, skipped: 'service-role-unavailable' });

    const { data: claimed, error: claimError } = await admin
      .from('user_profiles')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('id', authData.user.id)
      .is('welcome_email_sent_at', null)
      .select('email, first_name, full_name, username, role')
      .maybeSingle();

    if (claimError) {
      console.error('[email] welcome claim failed:', claimError.message);
      return NextResponse.json({ error: 'Could not send the welcome email.' }, { status: 500 });
    }
    if (!claimed) return NextResponse.json({ ok: true, skipped: 'already-sent' });

    const recipient = (claimed.email ?? authData.user.email ?? '').trim();
    if (!recipient) return NextResponse.json({ error: 'No email address on file.' }, { status: 400 });

    const result = await sendTemplateEmail({
      to: recipient,
      template: 'welcome',
      data: buildWelcomeData(claimed),
    });

    // Deliberately not reset on failure -- see migration 20260731000000.
    if (!result.ok) return NextResponse.json({ error: 'Could not send the welcome email.' }, { status: 502 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Could not send the welcome email.' }, { status: 500 });
  }
}
