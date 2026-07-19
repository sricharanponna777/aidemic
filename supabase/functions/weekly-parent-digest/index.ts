// Weekly parent email digest. Invoked by the `trigger_weekly_parent_digest()`
// pg_cron job (see migration 20260720100000) every Monday at 08:00 UTC via
// pg_net -- not meant to be called directly by the app or by end users.
//
// Deploy: supabase functions deploy weekly-parent-digest --no-verify-jwt
// Secrets (set once): supabase secrets set RESEND_API_KEY=... RESEND_FROM_EMAIL=... CRON_SECRET=...
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically by the platform.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const normalizeInsightLabel = (value: string) =>
  value
    .replace(/^Main pattern to fix:\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim()
    .slice(0, 70);

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));

type ChildDigest = {
  name: string;
  weeklyAssignmentsCompleted: number;
  weeklyPracticeAttempts: number;
  topWeaknessThisWeek: string | null;
  currentStreakDays: number;
  latestPredictedGrades: { subject: string; grade: string }[];
};

function buildStreak(sessionDates: number[]): number {
  const uniqueDays = new Set<number>();
  for (const ts of sessionDates) {
    const day = new Date(ts);
    day.setHours(0, 0, 0, 0);
    uniqueDays.add(day.getTime());
  }
  const sortedDays = Array.from(uniqueDays).sort((a, b) => b - a);
  let streak = 0;
  let expectedDay = new Date();
  expectedDay.setHours(0, 0, 0, 0);
  for (const dayTs of sortedDays) {
    if (dayTs === expectedDay.getTime()) {
      streak += 1;
      expectedDay = new Date(expectedDay.getTime() - 86400000);
      continue;
    }
    if (dayTs < expectedDay.getTime()) break;
  }
  return streak;
}

function renderEmailHtml(children: ChildDigest[]): string {
  const sections = children
    .map((child) => {
      const grades = child.latestPredictedGrades.length
        ? child.latestPredictedGrades
            .map((g) => `<span style="display:inline-block;margin:2px 6px 2px 0;padding:4px 10px;border-radius:8px;background:#eef2ff;color:#4338ca;font-weight:700;font-size:13px;">${escapeHtml(g.subject)}: ${escapeHtml(g.grade)}</span>`)
            .join('')
        : '<span style="color:#64748b;font-size:13px;">No exam practice yet.</span>';

      return `
        <div style="margin-bottom:24px;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">
          <h2 style="margin:0 0 12px;font-size:18px;color:#0f172a;">${escapeHtml(child.name)}</h2>
          <p style="margin:0 0 10px;font-size:14px;color:#334155;">
            This week: <strong>${child.weeklyPracticeAttempts}</strong> practice attempts,
            <strong>${child.weeklyAssignmentsCompleted}</strong> assignments completed,
            <strong>${child.currentStreakDays}</strong> day study streak.
          </p>
          ${child.topWeaknessThisWeek ? `<p style="margin:0 0 10px;font-size:14px;color:#92400e;">Recurring weak area this week: <strong>${escapeHtml(child.topWeaknessThisWeek)}</strong></p>` : ''}
          <div>${grades}</div>
        </div>`;
    })
    .join('');

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;">
      <h1 style="font-size:20px;color:#0f172a;">Your weekly AIDemic digest</h1>
      ${sections}
      <p style="font-size:12px;color:#94a3b8;margin-top:24px;">You are receiving this because your account is linked to a student on AIDemic.</p>
    </div>`;
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'AIDemic <onboarding@resend.dev>';
  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: links, error: linksError } = await supabase
    .from('parent_links')
    .select('parent_id, student_id')
    .eq('status', 'active');

  if (linksError) {
    return new Response(JSON.stringify({ error: linksError.message }), { status: 500 });
  }
  if (!links || links.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no active links' }), { status: 200 });
  }

  const parentIds = [...new Set(links.map((l) => l.parent_id as string))];
  const studentIds = [...new Set(links.map((l) => l.student_id as string))];

  const [{ data: parentProfiles }, { data: studentProfiles }] = await Promise.all([
    supabase.from('user_profiles').select('id, email').in('id', parentIds),
    supabase.from('user_profiles').select('id, full_name, first_name, username, email').in('id', studentIds),
  ]);

  const parentEmailById = new Map((parentProfiles ?? []).map((p: { id: string; email: string }) => [p.id, p.email]));
  const studentNameById = new Map(
    (studentProfiles ?? []).map((s: { id: string; full_name?: string; first_name?: string; username?: string; email?: string }) => [
      s.id,
      s.full_name || s.first_name || s.username || s.email || 'Student',
    ])
  );

  const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();

  const digestByStudent = new Map<string, ChildDigest>();
  for (const studentId of studentIds) {
    const [attemptsResp, sessionsResp, assignmentsResp] = await Promise.all([
      supabase
        .from('exam_practice_attempts')
        .select('subject, predicted_grade, weakness_tags, weakness_analysis, created_at')
        .eq('user_id', studentId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('study_sessions').select('started_at').eq('user_id', studentId),
      supabase.from('assignment_attempts').select('status, completed_at').eq('student_id', studentId),
    ]);

    const attempts = (attemptsResp.data ?? []) as Array<{
      subject: string;
      predicted_grade: string | null;
      weakness_tags: string[] | null;
      weakness_analysis: string[] | null;
      created_at: string;
    }>;
    const weeklyAttempts = attempts.filter((a) => a.created_at >= weekAgo);

    const latestGradeBySubject = new Map<string, string>();
    for (const attempt of attempts) {
      if (attempt.predicted_grade && !latestGradeBySubject.has(attempt.subject)) {
        latestGradeBySubject.set(attempt.subject, attempt.predicted_grade);
      }
    }

    const tagCounts = new Map<string, number>();
    for (const attempt of weeklyAttempts) {
      const raw = (attempt.weakness_tags?.length ? attempt.weakness_tags : attempt.weakness_analysis) ?? [];
      for (const tag of raw) {
        const norm = normalizeInsightLabel(tag);
        if (!norm) continue;
        tagCounts.set(norm, (tagCounts.get(norm) ?? 0) + 1);
      }
    }
    const topWeaknessThisWeek = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const sessionDates = ((sessionsResp.data ?? []) as Array<{ started_at: string | null }>)
      .map((s) => (s.started_at ? new Date(s.started_at).getTime() : NaN))
      .filter((t) => Number.isFinite(t));
    const currentStreakDays = buildStreak(sessionDates);

    const weeklyAssignmentsCompleted = ((assignmentsResp.data ?? []) as Array<{ status: string; completed_at: string | null }>).filter(
      (a) => a.status === 'completed' && a.completed_at && a.completed_at >= weekAgo
    ).length;

    digestByStudent.set(studentId, {
      name: studentNameById.get(studentId) ?? 'Student',
      weeklyAssignmentsCompleted,
      weeklyPracticeAttempts: weeklyAttempts.length,
      topWeaknessThisWeek,
      currentStreakDays,
      latestPredictedGrades: [...latestGradeBySubject.entries()].map(([subject, grade]) => ({ subject, grade })),
    });
  }

  const childrenByParent = new Map<string, ChildDigest[]>();
  for (const link of links) {
    const digest = digestByStudent.get(link.student_id as string);
    if (!digest) continue;
    const list = childrenByParent.get(link.parent_id as string) ?? [];
    list.push(digest);
    childrenByParent.set(link.parent_id as string, list);
  }

  let sent = 0;
  const failures: string[] = [];
  for (const [parentId, children] of childrenByParent.entries()) {
    const parentEmail = parentEmailById.get(parentId);
    if (!parentEmail) continue;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: parentEmail,
        subject: 'Your weekly AIDemic digest',
        html: renderEmailHtml(children),
      }),
    });

    if (response.ok) {
      sent += 1;
    } else {
      failures.push(`${parentEmail}: ${await response.text()}`);
    }
  }

  return new Response(JSON.stringify({ sent, failures }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
