// Notifies a student by email as soon as a parent redeems an invite code and
// links to their account. Invoked by the `parent_link_activated_notify`
// trigger (see migration 20260722000000) via pg_net, immediately after
// redeem_parent_invite_code() flips a parent_links row to 'active' -- not
// meant to be called directly by the app or by end users.
//
// Deploy: supabase functions deploy parent-link-notification --no-verify-jwt
// Secrets (set once): supabase secrets set PARENT_LINK_NOTIFICATION_SECRET=...
// (RESEND_API_KEY / RESEND_FROM_EMAIL are already configured for the weekly
// digest and are reused here. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
// provided automatically by the platform.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));

type Profile = { id: string; email: string; full_name?: string | null; first_name?: string | null; username?: string | null };

const displayName = (profile?: Profile) =>
  profile?.full_name || profile?.first_name || profile?.username || profile?.email || 'Someone';

function renderEmailHtml({ studentName, parentName }: { studentName: string; parentName: string }): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;">
      <h1 style="font-size:20px;color:#0f172a;">A parent linked to your AIDemic account</h1>
      <p style="font-size:14px;color:#334155;">Hi ${escapeHtml(studentName)},</p>
      <p style="font-size:14px;color:#334155;">
        <strong>${escapeHtml(parentName)}</strong> just redeemed your invite code and is now linked to your account.
        They can see your predicted grades, study streak, recurring weak topics, and assignment progress -- but
        they cannot change or delete anything.
      </p>
      <p style="font-size:14px;color:#334155;">
        If this wasn't you, or you'd like to remove their access, you can do so any time from the Family page in
        your dashboard.
      </p>
      <p style="font-size:12px;color:#94a3b8;margin-top:24px;">You are receiving this because someone linked a parent account to your AIDemic profile.</p>
    </div>`;
}

Deno.serve(async (req) => {
  const linkSecret = Deno.env.get('PARENT_LINK_NOTIFICATION_SECRET') ?? '';
  if (linkSecret && req.headers.get('x-link-secret') !== linkSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'AIDemic <onboarding@resend.dev>';
  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500 });
  }

  const { student_id: studentId, parent_id: parentId } = await req.json().catch(() => ({}));
  if (!studentId || !parentId) {
    return new Response(JSON.stringify({ error: 'student_id and parent_id are required' }), { status: 400 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const [{ data: studentProfile }, { data: parentProfile }] = await Promise.all([
    supabase.from('user_profiles').select('id, email, full_name, first_name, username').eq('id', studentId).maybeSingle(),
    supabase.from('user_profiles').select('id, email, full_name, first_name, username').eq('id', parentId).maybeSingle(),
  ]);

  if (!studentProfile?.email) {
    return new Response(JSON.stringify({ error: 'Student profile/email not found' }), { status: 404 });
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromEmail,
      to: studentProfile.email,
      subject: 'A parent linked to your AIDemic account',
      html: renderEmailHtml({
        studentName: displayName(studentProfile as Profile),
        parentName: displayName(parentProfile as Profile | undefined),
      }),
    }),
  });

  if (!response.ok) {
    return new Response(JSON.stringify({ sent: false, error: await response.text() }), { status: 502 });
  }

  return new Response(JSON.stringify({ sent: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
