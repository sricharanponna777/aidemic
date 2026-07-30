// Email client for sending template-based emails via Brevo API.
// Server-only: no NEXT_PUBLIC_ prefix, so importing from a client component
// reads undefined and silently no-ops. Import from route handlers only.

import { sendEmail as sendViaMailer, getMissingMailerEnv } from './email-mailer';

type TemplateData = Record<string, string | number | boolean>;

type EmailConfig = {
  appName: string;
  appUrl: string;
  supportEmail: string;
};

type Role = 'student' | 'teacher' | 'parent';

const read = (name: string) => (process.env[name] || '').trim();

/** Which required variables are unset. Empty means email is configured. */
export function missingEmailEnv(): string[] {
  const missing = getMissingMailerEnv();
  const appUrl = read('APP_URL');
  const supportEmail = read('SUPPORT_EMAIL');

  if (!appUrl) missing.push('APP_URL');
  if (!supportEmail) missing.push('SUPPORT_EMAIL');

  return missing;
}

/**
 * `null` when email is not configured -- local dev without Brevo, or a deploy
 * that has not had the variables added yet. Callers treat that as "skip",
 * never "fail": a missing welcome email must not break signup.
 */
export function getEmailServerConfig(): EmailConfig | null {
  if (missingEmailEnv().length > 0) return null;
  return {
    appName: read('APP_NAME') || 'AIDemic',
    appUrl: read('APP_URL').replace(/\/+$/, ''),
    supportEmail: read('SUPPORT_EMAIL'),
  };
}

/**
 * email-server interpolates the *subject* unescaped -- it is a plain-text
 * header, not markup -- and `first_name` is written client-side at signup with
 * no server validation, so it is attacker-controlled text landing in a mail
 * header. Strip anything that could fold in another header, and cap the length
 * so a 4KB "first name" cannot produce an unsendable Subject.
 */
export function sanitizeHeaderText(value: string, max = 60): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

type SendResult = { ok: boolean; skipped?: 'not-configured'; error?: string };

/** Never throws. Returns ok: false so the caller decides, and logs the detail. */
export async function sendTemplateEmail(input: {
  to: string;
  template: string;
  data: TemplateData;
  subject?: string;
}): Promise<SendResult> {
  const config = getEmailServerConfig();
  if (!config) {
    console.warn(`[email] skipped "${input.template}": unset ${missingEmailEnv().join(', ')}`);
    return { ok: false, skipped: 'not-configured' };
  }

  // Enrich data with config values (appName, supportEmail, year)
  const enrichedData = {
    ...input.data,
    appName: config.appName,
    supportEmail: config.supportEmail,
    year: new Date().getFullYear(),
  };

  const result = await sendViaMailer({
    to: input.to,
    template: input.template,
    data: enrichedData,
    subject: input.subject,
  });

  return { ok: result.ok, error: result.error };
}

// ---------------------------------------------------------------------------
// Welcome email content.
//
// email-server's template engine has no conditionals and no loops, so the
// role-specific part is built here and passed through welcome.html's raw
// {{{ highlights }}} slot. STATIC COPY ONLY -- that slot is not escaped, so
// nothing user-supplied may ever be interpolated into it.
// ---------------------------------------------------------------------------

const WELCOME_CONTENT: Record<
  Role,
  {
    intro: (appName: string) => string;
    actionLabel: string;
    actionPath: string;
    highlights: readonly (readonly [string, string])[];
  }
> = {
  student: {
    intro: (appName) =>
      `Your ${appName} account is ready. Here is the fastest way to turn revision time into marks.`,
    actionLabel: 'Start your first practice',
    actionPath: '/dashboard',
    highlights: [
      [
        'Practise real exam questions',
        'Answer past-paper style questions and get them marked instantly, with a predicted grade per subject.',
      ],
      [
        'Let the planner pick what is next',
        'Your weakest subtopics surface first, so the hour you spend lands where it moves your grade.',
      ],
      [
        'Review in five minutes a day',
        'Daily Review brings back what you are about to forget, one question at a time.',
      ],
    ],
  },
  teacher: {
    intro: (appName) =>
      `Your ${appName} account is ready. Set up a class and you will see where your students actually stand.`,
    actionLabel: 'Set up your first class',
    actionPath: '/dashboard/teacher',
    highlights: [
      ['Create a class in a minute', 'Share one join code; students appear on your roster as they enrol.'],
      [
        'Set assignments that mark themselves',
        'Written answers are marked against the spec, so you read the analysis instead of producing it.',
      ],
      [
        'Spot the class-wide gaps',
        'Per-subtopic mastery across the whole class tells you what to reteach before the next test.',
      ],
    ],
  },
  parent: {
    intro: (appName) =>
      `Your ${appName} account is ready. Link your child and you will know how revision is really going.`,
    actionLabel: 'Link your child',
    actionPath: '/dashboard/parent',
    highlights: [
      [
        'Link your child with an invite code',
        'One code from your child connects the two accounts, and nothing is shared until they generate it.',
      ],
      [
        'See the week at a glance',
        'Practice attempts, assignments completed and study streak, without having to ask.',
      ],
      [
        'Get a digest every Monday',
        'A short weekly email covering progress, predicted grades and the topic to help with next.',
      ],
    ],
  },
};

/** Numbered rows as presentation tables, matching the digest cards' language. */
function renderHighlights(rows: readonly (readonly [string, string])[]): string {
  return rows
    .map(
      ([title, body], index) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
  <tr>
    <td width="32" valign="top" style="padding:2px 12px 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td width="20" align="center" style="width:20px; height:20px; border-radius:10px; background-color:#eef2ff; font-size:12px; line-height:20px; font-weight:700; color:#4338ca;">${index + 1}</td>
        </tr>
      </table>
    </td>
    <td valign="top">
      <p style="margin:0; font-size:15px; line-height:1.4; font-weight:650; color:#111827;">${title}</p>
      <p style="margin:3px 0 0; font-size:14px; line-height:1.55; color:#6b7280;">${body}</p>
    </td>
  </tr>
</table>`
    )
    .join('');
}

export type WelcomeProfile = {
  email?: string | null;
  first_name?: string | null;
  full_name?: string | null;
  username?: string | null;
  role?: string | null;
};

/** Exactly the seven variables welcome.html requires -- a missing one is a hard
 *  400, so src/lib/email.test.ts pins the key set. */
export function buildWelcomeData(profile: WelcomeProfile): TemplateData {
  const config = getEmailServerConfig();
  if (!config) throw new Error('email-server is not configured.');

  const role: Role = profile.role === 'teacher' || profile.role === 'parent' ? profile.role : 'student';
  const content = WELCOME_CONTENT[role];
  const rawName =
    profile.first_name?.trim() ||
    profile.full_name?.trim().split(' ')[0] ||
    profile.username?.trim() ||
    'there';

  return {
    appName: config.appName,
    supportEmail: config.supportEmail,
    firstName: sanitizeHeaderText(rawName),
    intro: content.intro(config.appName),
    highlights: renderHighlights(content.highlights),
    actionLabel: content.actionLabel,
    actionUrl: `${config.appUrl}${content.actionPath}`,
  };
}
