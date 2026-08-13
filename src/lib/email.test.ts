import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPasswordResetData,
  buildWelcomeData,
  getEmailServerConfig,
  missingEmailEnv,
  sanitizeHeaderText,
  sendTemplateEmail,
} from './email';

// The exact variable list welcome.html requires -- the union of the placeholders
// in the manifest subject, the body and _layout.html. Hardcoded rather than
// computed so that editing the template without updating buildWelcomeData fails
// here instead of as a render error on a real signup.
const WELCOME_VARIABLES = [
  'actionLabel',
  'actionUrl',
  'appName',
  'firstName',
  'highlights',
  'intro',
  'supportEmail',
] as const;

/** Same contract for password-reset.html: subject + body + layout placeholders. */
const PASSWORD_RESET_VARIABLES = [
  'appName',
  'expiryMinutes',
  'firstName',
  'resetUrl',
  'supportEmail',
] as const;

const ENV = ['BREVO_API_KEY', 'BREVO_SMTP_FROM', 'APP_URL', 'SUPPORT_EMAIL', 'APP_NAME'] as const;

function configure() {
  process.env.BREVO_API_KEY = 'test-api-key';
  process.env.BREVO_SMTP_FROM = 'AIDemic <noreply@example.com>';
  process.env.APP_URL = 'https://app.example.com';
  process.env.SUPPORT_EMAIL = 'support@example.com';
  process.env.APP_NAME = 'AIDemic';
}

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of ENV) saved[name] = process.env[name];
  configure();
});

afterEach(() => {
  for (const name of ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  vi.restoreAllMocks();
});

describe('missingEmailEnv / getEmailServerConfig', () => {
  it('reports nothing missing when all are set', () => {
    expect(missingEmailEnv()).toEqual([]);
    expect(getEmailServerConfig()).not.toBeNull();
  });

  it('gates on required config', () => {
    delete process.env.SUPPORT_EMAIL;
    expect(missingEmailEnv()).toContain('SUPPORT_EMAIL');
    expect(getEmailServerConfig()).toBeNull();
  });

  it('treats whitespace as unset', () => {
    process.env.APP_URL = '   ';
    expect(missingEmailEnv()).toContain('APP_URL');
  });

  it('strips trailing slashes so URLs never double up', () => {
    process.env.APP_URL = 'https://app.example.com//';
    const config = getEmailServerConfig();
    expect(config?.appUrl).toBe('https://app.example.com');
  });

  it('defaults appName but never the others', () => {
    delete process.env.APP_NAME;
    expect(getEmailServerConfig()?.appName).toBe('AIDemic');
  });
});

describe('sanitizeHeaderText', () => {
  it('strips CR/LF so a name cannot fold in another mail header', () => {
    const result = sanitizeHeaderText('Bob\r\nBcc: evil@example.com');
    expect(result).not.toContain('\n');
    expect(result).not.toContain('\r');
    expect(result).toBe('Bob Bcc: evil@example.com');
  });

  it('collapses runs of whitespace', () => {
    expect(sanitizeHeaderText('  Ada   Lovelace  ')).toBe('Ada Lovelace');
  });

  it('truncates so an oversized name cannot break the Subject', () => {
    expect(sanitizeHeaderText('x'.repeat(500))).toHaveLength(60);
    expect(sanitizeHeaderText('x'.repeat(500), 10)).toHaveLength(10);
  });
});

describe('buildWelcomeData', () => {
  it('returns exactly the variables welcome.html requires, all non-empty', () => {
    for (const role of ['student', 'teacher', 'parent', null, 'garbage']) {
      const data = buildWelcomeData({ first_name: 'Ada', role });
      expect(Object.keys(data).sort()).toEqual([...WELCOME_VARIABLES]);
      for (const [key, value] of Object.entries(data)) {
        expect(String(value).trim(), `${role} / ${key}`).not.toBe('');
      }
    }
  });

  it('routes each role to its own CTA', () => {
    expect(buildWelcomeData({ role: 'student' }).actionUrl).toBe('https://app.example.com/dashboard');
    expect(buildWelcomeData({ role: 'teacher' }).actionUrl).toBe('https://app.example.com/dashboard/teacher');
    expect(buildWelcomeData({ role: 'parent' }).actionUrl).toBe('https://app.example.com/dashboard/parent');
    expect(buildWelcomeData({ role: 'teacher' }).actionLabel).toBe('Set up your first class');
  });

  it('falls back to the student variant for an unknown or missing role', () => {
    const fallback = buildWelcomeData({ role: 'garbage' });
    expect(fallback).toEqual(buildWelcomeData({ role: 'student' }));
    expect(buildWelcomeData({ role: null })).toEqual(fallback);
  });

  it('walks the name fallback chain', () => {
    expect(buildWelcomeData({ first_name: 'Ada', full_name: 'Ada Lovelace' }).firstName).toBe('Ada');
    expect(buildWelcomeData({ first_name: '  ', full_name: 'Ada Lovelace' }).firstName).toBe('Ada');
    expect(buildWelcomeData({ full_name: '', username: 'ada99' }).firstName).toBe('ada99');
    expect(buildWelcomeData({}).firstName).toBe('there');
  });

  it('sanitizes the name, which reaches the unescaped Subject header', () => {
    const data = buildWelcomeData({ first_name: 'Ada\r\nBcc: evil@example.com' });
    expect(String(data.firstName)).not.toMatch(/[\r\n]/);
  });

  it('leaves no unsubstituted placeholder in the raw highlights slot', () => {
    // The slot is interpolated raw, and the outer pass would swallow a stray
    // {{token}} while adding it to the template's required variables.
    for (const role of ['student', 'teacher', 'parent']) {
      expect(String(buildWelcomeData({ role }).highlights)).not.toContain('{{');
    }
  });

  it('throws when called without configuration, rather than sending a broken email', () => {
    delete process.env.SUPPORT_EMAIL;
    expect(() => buildWelcomeData({ first_name: 'Ada' })).toThrow(/not configured/i);
  });
});

describe('buildPasswordResetData', () => {
  const resetUrl = 'https://app.example.com/auth/confirm?token_hash=abc&type=recovery';

  it('returns exactly the variables password-reset.html requires, all non-empty', () => {
    const data = buildPasswordResetData({ resetUrl, firstName: 'Ada' });
    expect(Object.keys(data).sort()).toEqual([...PASSWORD_RESET_VARIABLES]);
    for (const [key, value] of Object.entries(data)) {
      expect(String(value).trim(), key).not.toBe('');
    }
  });

  it('passes the reset URL through untouched', () => {
    expect(buildPasswordResetData({ resetUrl }).resetUrl).toBe(resetUrl);
  });

  it('falls back to a neutral greeting when no name is on file', () => {
    expect(buildPasswordResetData({ resetUrl }).firstName).toBe('there');
    expect(buildPasswordResetData({ resetUrl, firstName: '  ' }).firstName).toBe('there');
    expect(buildPasswordResetData({ resetUrl, firstName: null }).firstName).toBe('there');
  });

  it('renders through Brevo without leaving an unsubstituted placeholder', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ messageId: '<test@example.com>' }), { status: 200 }));

    const result = await sendTemplateEmail({
      to: 'a@example.com',
      template: 'password-reset',
      data: buildPasswordResetData({ resetUrl, firstName: 'Ada' }),
    });

    expect(result.ok).toBe(true);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
    const body = JSON.parse(String(init?.body)) as { subject: string; htmlContent: string };
    expect(body.subject).toBe('Reset your AIDemic password');
    // Entity-escaped in the href, which is valid HTML -- clients decode it back
    // to the URL the route built.
    expect(body.htmlContent).toContain(resetUrl.replace(/&/g, '&amp;'));
    expect(body.htmlContent).not.toContain('{{');
  });

  it('throws when called without configuration, rather than sending a broken email', () => {
    delete process.env.SUPPORT_EMAIL;
    expect(() => buildPasswordResetData({ resetUrl })).toThrow(/not configured/i);
  });
});

describe('sendTemplateEmail', () => {
  it('no-ops without calling out when email is not configured', async () => {
    // Build data while config is set
    const data = buildWelcomeData({});
    // Then delete the config for the send call
    delete process.env.BREVO_API_KEY;

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await sendTemplateEmail({ to: 'a@example.com', template: 'welcome', data });

    expect(result).toEqual({ ok: false, skipped: 'not-configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('posts to Brevo API with the API key', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ messageId: '<test@example.com>' }), { status: 200 }));

    const result = await sendTemplateEmail({
      to: 'a@example.com',
      template: 'welcome',
      data: buildWelcomeData({ first_name: 'Ada' }),
    });

    expect(result.ok).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init?.headers as Record<string, string>)['api-key']).toBe('test-api-key');
  });

  it('reports a non-2xx as a failure without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'bad_request' } }), { status: 400 })
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendTemplateEmail({ to: 'a@example.com', template: 'welcome', data: buildWelcomeData({}) })).resolves.toEqual({
      ok: false,
      error: 'HTTP 400',
    });
  });

  it('swallows a transport error so a caller can never be broken by email', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendTemplateEmail({ to: 'a@example.com', template: 'welcome', data: buildWelcomeData({}) })).resolves.toEqual({
      ok: false,
      error: 'ECONNREFUSED',
    });
  });
});
