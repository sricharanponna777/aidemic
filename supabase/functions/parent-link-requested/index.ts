// Notifies a student by email as soon as a parent submits a link request.
// Invoked by the `parent_link_requested_notify` trigger (see migration 20260801010000)
// via pg_net, immediately after request_parent_link() inserts a pending parent_links row
// with link_source='parent' -- not meant to be called directly by the app or by end users.
//
// Deploy: supabase functions deploy parent-link-requested --no-verify-jwt
// Secrets (set once): supabase secrets set PARENT_LINK_REQUESTED_SECRET=...
// (RESEND_API_KEY / RESEND_FROM_EMAIL are already configured for other functions
// and are reused here. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided
// automatically by the platform.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));

type Profile = { id: string; email: string; full_name?: string | null; first_name?: string | null; username?: string | null };

const displayName = (profile?: Profile) =>
  profile?.full_name || profile?.first_name || profile?.username || profile?.email || 'Someone';

function renderEmailHtml({ studentName, parentName }: { studentName: string; parentName: string }): string {
  const dashboardUrl = `${Deno.env.get('APP_URL') || 'https://aidemic.ai'}/dashboard/family`;
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;">
      <h1 style="font-size:20px;color:#0f172a;">Parent account link request</h1>
      <p style="font-size:14px;color:#334155;">Hi ${escapeHtml(studentName)},</p>
      <p style="font-size:14px;color:#334155;">
        <strong>${escapeHtml(parentName)}</strong> wants to link to your AIDemic account as your parent.
        If you accept, they can see your predicted grades, study streak, recurring weak topics, and assignment progress -- but
        they cannot change or delete anything.
      </p>
      <p style="font-size:14px;color:#334155;margin-top:20px;">
        <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:10px 20px;background-color:#4f46e5;color:white;text-decoration:none;border-radius:6px;font-weight:500;">Review request in your dashboard</a>
      </p>
      <p style="font-size:14px;color:#334155;margin-top:16px;">
        You can accept or decline this request anytime from the Family page in your dashboard.
      </p>
      <p style="font-size:12px;color:#94a3b8;margin-top:24px;">You are receiving this because someone requested to link as your parent on AIDemic.</p>
    </div>`;
}

Deno.serve(async (req) => {
  const linkSecret = Deno.env.get('PARENT_LINK_REQUESTED_SECRET') ?? '';
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
      subject: 'Parent account link request on AIDemic',
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
