// Weekly parent email digest. Invoked by the `trigger_weekly_parent_digest()`
// pg_cron job (see migration 20260720100000) every Monday at 08:00 UTC via
// pg_net -- not meant to be called directly by the app or by end users.
//
// Delivery goes through the main app's /api/email/bulk endpoint, which must be
// reachable over public HTTPS from Supabase's edge network -- there is no VPC
// peering. One POST /api/email/bulk per 100 parents, so retries, connection
// pooling and the plain-text alternative are all the app's problem.
//
// Deploy: supabase functions deploy weekly-parent-digest --no-verify-jwt
// Secrets (set once): supabase secrets set APP_URL=... BULK_EMAIL_SECRET=... \
//   APP_NAME=AIDemic SUPPORT_EMAIL=... CRON_SECRET=...
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically by the platform.)
//
// The `weekly-digest` template must exist in the main app's src/emails/templates/
// BEFORE this function is deployed, or every message comes back 404.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** POST /api/email/bulk hard-caps `messages` at 100. */
const CHUNK_SIZE = 100;
/** 100 messages at BULK_CONCURRENCY=5 with 2 retries is ~20 sequential rounds;
 *  at 1-2s per send that is 20-40s, and a retried batch could double it. Drop
 *  CHUNK_SIZE to 25 if this ever trips. */
const CHUNK_TIMEOUT_MS = 120_000;
/** Bad key, undeployed template, malformed data, oversized body -- all of them
 *  fail every remaining chunk the same way, so the loop stops instead. */
const FATAL_STATUSES = [400, 401, 403, 404, 413];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type BulkResponse = {
  ok: boolean;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  results: Array<{
    index: number;
    status: 'sent' | 'failed' | 'skipped';
    to: string[];
    messageId?: string;
    previewUrl?: string;
    error?: { code: string; message: string; details?: unknown };
  }>;
};

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
  lifetimePracticeHours: number;
  lifetimeDaysStudied: number;
  longestStreakDays: number;
  averageGrade: string | null;
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

function buildLongestStreak(sessionDates: number[]): number {
  const uniqueDays = new Set<number>();
  for (const ts of sessionDates) {
    const day = new Date(ts);
    day.setHours(0, 0, 0, 0);
    uniqueDays.add(day.getTime());
  }
  const sortedDays = Array.from(uniqueDays).sort((a, b) => a - b);
  if (sortedDays.length === 0) return 0;

  let maxStreak = 1;
  let currentStreak = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    if (sortedDays[i] - sortedDays[i - 1] === 86400000) {
      currentStreak += 1;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }
  return maxStreak;
}

// --------------------------------------------------------------------------
// Fills the `childrenHtml` raw slot of email-server's `weekly-digest` template.
// Conventions are email-server's: every style inline, layout via
// role="presentation" tables (mail clients support neither flex nor grid), and
// the .sm-*/.dm-* classes come from the <style> block in
// email-server/src/templates/_layout.html.
//
// Use NUMERIC character references (&#183;) only. email-server's htmlToText
// decodes just eight named entities plus &nbsp; -- any other named entity would
// leak literally into the auto-generated plain-text part.
// --------------------------------------------------------------------------

const MAX_GRADE_PILLS = 6;

function renderStat(value: number, label: string): string {
  return `<td class="sm-stack" width="33%" align="center" valign="top" style="padding:0 4px;">
            <div style="font-size:26px; line-height:1.1; font-weight:700; color:#4f46e5;">${value}</div>
            <div style="margin-top:4px; font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6b7280;">${label}</div>
          </td>`;
}

function renderGradePills(grades: { subject: string; grade: string }[]): string {
  if (grades.length === 0) {
    return '<p style="margin:0; font-size:13px; color:#6b7280;">No exam practice recorded yet.</p>';
  }

  const shown = grades.slice(0, MAX_GRADE_PILLS);
  const pills = shown
    .map(
      (g) =>
        `<span style="display:inline-block; margin:0 6px 6px 0; padding:4px 10px; border-radius:8px; background-color:#eef2ff; font-size:13px; font-weight:600; color:#4338ca;">${escapeHtml(g.subject)} &#183; ${escapeHtml(g.grade)}</span>`
    )
    // Joined on a space, not '': the pills are inline-block spans, so without
    // it htmlToText runs them together as "Mathematics · APhysics · B+" in the
    // plain-text part. In HTML it is an unnoticeable few pixels of extra gap.
    .join(' ');
  const overflow = grades.length - shown.length;
  const more =
    overflow > 0
      ? ` <span style="display:inline-block; margin:0 0 6px; padding:4px 0; font-size:13px; color:#6b7280;">+${overflow} more</span>`
      : '';

  return `<p style="margin:0 0 8px; font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6b7280;">Latest predicted grades</p>
          <div style="margin:0 0 -6px;">${pills}${more}</div>`;
}

function renderChildCard(child: ChildDigest): string {
  const weakness = child.topWeaknessThisWeek
    ? `<p style="margin:0 0 14px; padding:12px 14px; background-color:#fef9ec; border-left:3px solid #f0b429; border-radius:0 6px 6px 0; font-size:13px; line-height:1.5; color:#5c4813;"><strong style="font-weight:650;">Focus area this week:</strong> ${escapeHtml(child.topWeaknessThisWeek)}</p>`
    : '';

  // The stat values sit in <div>s rather than <span>s so htmlToText emits
  // "12\nPractice" instead of running every number into one line.
  return `
<table role="presentation" class="dm-card" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px; border:1px solid #e4e4ea; border-radius:10px; background-color:#ffffff;">
  <tr>
    <td class="dm-body" style="padding:18px 20px;">
      <h2 style="margin:0 0 14px; font-size:16px; line-height:1.3; font-weight:650; letter-spacing:-0.01em; color:#111827;">${escapeHtml(child.name)}</h2>

      <p style="margin:0 0 8px; font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6b7280;">This week</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px; background-color:#f7f7fb; border-radius:8px;">
        <tr>
          <td style="padding:14px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                ${renderStat(child.weeklyPracticeAttempts, 'Practice')}
                ${renderStat(child.weeklyAssignmentsCompleted, 'Assignments')}
                ${renderStat(child.currentStreakDays, 'Day streak')}
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 8px; font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6b7280;">Lifetime</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px; background-color:#f7f7fb; border-radius:8px;">
        <tr>
          <td style="padding:14px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                ${renderStat(child.lifetimePracticeHours, 'Hours studied')}
                ${renderStat(child.lifetimeDaysStudied, 'Days studied')}
                ${renderStat(child.longestStreakDays, 'Best streak')}
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${weakness}
      ${renderGradePills(child.latestPredictedGrades)}
    </td>
  </tr>
</table>`;
}

/** Deduped and ordered: `childrenByParent` pushes once per link, so two active
 *  links to the same student would render that child twice, and link order is
 *  not deterministic. */
function renderChildrenHtml(children: ChildDigest[]): string {
  const unique = new Map(children.map((child) => [child.name, child]));
  return [...unique.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(renderChildCard)
    .join('');
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const appUrl = (Deno.env.get('APP_URL') ?? '').trim().replace(/\/+$/, '');
  const bulkEmailSecret = (Deno.env.get('BULK_EMAIL_SECRET') ?? '').trim();
  const supportEmail = (Deno.env.get('SUPPORT_EMAIL') ?? '').trim();
  const appName = (Deno.env.get('APP_NAME') || 'AIDemic').trim();

  // Checked for non-emptiness up front rather than left to the first send: an
  // empty string is a *defined* template value, so the API would happily
  // render `mailto:` with no address and a CTA pointing at a path on no host.
  // Failing here is the only way that stays visible.
  const missingConfig = [
    ['APP_URL', appUrl],
    ['BULK_EMAIL_SECRET', bulkEmailSecret],
    ['SUPPORT_EMAIL', supportEmail],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingConfig.length > 0) {
    console.error(`[weekly-digest] missing config: ${missingConfig.join(', ')}`);
    return new Response(JSON.stringify({ error: `Missing config: ${missingConfig.join(', ')}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Required above, not optional: /api/email/bulk treats an unset secret as
  // "open endpoint", so a digest run that sent without one would be silently
  // relying on the app's bulk mailer being unauthenticated in production.
  const emailApiUrl = `${appUrl}/api/email/bulk`;

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
      supabase.from('study_sessions').select('started_at, duration_minutes').eq('user_id', studentId),
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

    const sessions = (sessionsResp.data ?? []) as Array<{ started_at: string | null; duration_minutes: number | null }>;
    const sessionDates = sessions
      .map((s) => (s.started_at ? new Date(s.started_at).getTime() : NaN))
      .filter((t) => Number.isFinite(t));
    const currentStreakDays = buildStreak(sessionDates);

    const lifetimePracticeMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
    const lifetimePracticeHours = Math.round(lifetimePracticeMinutes / 60);

    const uniqueDays = new Set<number>();
    for (const s of sessions) {
      if (s.started_at) {
        const day = new Date(s.started_at);
        day.setHours(0, 0, 0, 0);
        uniqueDays.add(day.getTime());
      }
    }
    const lifetimeDaysStudied = uniqueDays.size;

    const longestStreakDays = buildLongestStreak(sessionDates);

    const gradeValues = Array.from(latestGradeBySubject.values())
      .filter((g) => /^[A-Fa-f][\+*]?$|^\d+/.test(g))
      .map((g) => {
        const match = g.match(/^([A-Fa-f])([\+*])?/);
        if (match) {
          const base = g.charCodeAt(0) - 65;
          const modifier = match[2] === '+' ? 0.5 : match[2] === '*' ? -0.5 : 0;
          return base + modifier;
        }
        return NaN;
      })
      .filter((v) => !isNaN(v));
    const averageGrade = gradeValues.length > 0 ? String.fromCharCode(65 + Math.round(gradeValues.reduce((a, b) => a + b) / gradeValues.length)) : null;

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
      lifetimePracticeHours,
      lifetimeDaysStudied,
      longestStreakDays,
      averageGrade,
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

  // email-server validates every message in a chunk before it sends any of
  // them, so a single unparseable address would 400 all 100. Filter first.
  const messages: Array<{ to: string; template: string; data: Record<string, string> }> = [];
  let invalidRecipients = 0;

  const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const periodLabel = `${dayMonth.format(new Date(Date.now() - WEEK_MS))} – ${dayMonth.format(new Date())}`;

  for (const [parentId, children] of childrenByParent.entries()) {
    const parentEmail = (parentEmailById.get(parentId) ?? '').trim();
    if (!EMAIL_PATTERN.test(parentEmail)) {
      invalidRecipients += 1;
      continue;
    }

    messages.push({
      to: parentEmail,
      template: 'weekly-digest',
      // `from` is omitted on purpose: email-server falls back to MAIL_FROM, so
      // the sender identity lives in one place instead of two.
      data: {
        appName,
        supportEmail,
        periodLabel,
        dashboardUrl: `${appUrl}/dashboard/parent`,
        childrenHtml: renderChildrenHtml(children),
      },
    });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let aborted: string | null = null;
  let previewUrl: string | undefined;
  const failures: string[] = [];

  for (let offset = 0; offset < messages.length; offset += CHUNK_SIZE) {
    const chunk = messages.slice(offset, offset + CHUNK_SIZE);

    let response: Response;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (bulkEmailSecret) {
        headers['x-api-key'] = bulkEmailSecret;
      }

      response = await fetch(emailApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: chunk }),
        // A hung API would otherwise burn this function's whole wall-clock
        // budget and take every later chunk down with it, silently.
        signal: AbortSignal.timeout(CHUNK_TIMEOUT_MS),
      });
    } catch (error) {
      failed += chunk.length;
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`chunk@${offset}: transport: ${detail}`);
      console.error(`[weekly-digest] chunk@${offset} transport failure: ${detail}`);
      continue;
    }

    const bodyText = await response.text();
    let body: BulkResponse | null;
    try {
      body = JSON.parse(bodyText) as BulkResponse;
    } catch {
      body = null;
    }

    // 200 (all sent), 207 (partial) and 502 (none sent) all carry `results`.
    // Anything else is a rejection of the request as a whole.
    if (body && Array.isArray(body.results)) {
      sent += body.sent;
      failed += body.failed;
      skipped += body.skipped;
      for (const result of body.results) {
        if (result.status === 'sent') {
          previewUrl ??= result.previewUrl;
          continue;
        }
        failures.push(
          `${result.to.join(',')}: ${result.status}: ${result.error?.code ?? 'unknown'}: ${result.error?.message ?? ''}`.slice(0, 300)
        );
      }
      continue;
    }

    failed += chunk.length;
    failures.push(`chunk@${offset}: HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
    console.error(`[weekly-digest] chunk@${offset} rejected: HTTP ${response.status} ${bodyText.slice(0, 500)}`);

    // A bad API key, an undeployed template, malformed data or an oversized body
    // all fail every remaining chunk identically. Stop rather than hammer a
    // server that has already said no.
    if (FATAL_STATUSES.includes(response.status)) {
      aborted = `HTTP ${response.status} from email-server; ${messages.length - offset - chunk.length} messages not attempted`;
      break;
    }
  }

  const summary = {
    parents: childrenByParent.size,
    attempted: messages.length,
    sent,
    failed,
    skipped,
    invalidRecipients,
    ...(aborted ? { aborted } : {}),
  };

  // pg_net discards the response body, so console is the only channel through
  // which a failed Monday run is visible (`supabase functions logs
  // weekly-parent-digest`). The returned JSON is for manual invocation.
  if (failed > 0 || aborted || invalidRecipients > 0) {
    console.error('[weekly-digest]', JSON.stringify({ ...summary, failures: failures.slice(0, 20) }));
  } else {
    console.log('[weekly-digest]', JSON.stringify(summary));
  }
  if (previewUrl) console.log(`[weekly-digest] test-transport preview: ${previewUrl}`);

  // A real status code, unlike the previous unconditional 200 that made total
  // failure look identical to success. pg_net ignores it, but it persists in
  // net._http_response.status_code, which makes that table a usable health
  // check. Nothing retries on non-2xx, so there is no retry-storm risk.
  const status = messages.length === 0 ? 200 : sent === 0 ? 500 : failed > 0 || aborted ? 207 : 200;

  return new Response(JSON.stringify({ ...summary, failures: failures.slice(0, 20) }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
});
