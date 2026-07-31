import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderTemplate } from './email-mailer';

// Every variable welcome.html + _layout.html require, so each test can vary one.
const WELCOME_DATA = {
  appName: 'AIDemic',
  supportEmail: 'support@example.com',
  firstName: 'Ada',
  intro: 'Your account is ready.',
  highlights: '<p>highlight row</p>',
  actionLabel: 'Get started',
  actionUrl: 'https://app.example.com/dashboard',
};

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved.BREVO_API_KEY = process.env.BREVO_API_KEY;
  saved.BREVO_SMTP_FROM = process.env.BREVO_SMTP_FROM;
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('renderTemplate', () => {
  it('leaves the Subject unescaped -- it is a mail header, not markup', async () => {
    const { subject } = await renderTemplate('welcome', { ...WELCOME_DATA, firstName: "O'Brien & Sons" });
    expect(subject).toBe("Welcome to AIDemic, O'Brien & Sons");
    expect(subject).not.toContain('&#39;');
    expect(subject).not.toContain('&amp;');
  });

  it('escapes double-brace values in the body', async () => {
    const { html } = await renderTemplate('welcome', { ...WELCOME_DATA, firstName: '<script>alert(1)</script>' });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('renders the triple-brace slot raw', async () => {
    const { html } = await renderTemplate('welcome', { ...WELCOME_DATA, highlights: '<p>highlight row</p>' });
    expect(html).toContain('<p>highlight row</p>');
  });

  it('never re-expands a substituted value as a placeholder', async () => {
    // A display name is user-chosen. If the escaped pass and the raw pass run in
    // sequence, this name lands in the body as a `{{{highlights}}}` token that
    // the raw pass then expands -- injecting unescaped HTML into the email.
    const { html } = await renderTemplate('welcome', {
      ...WELCOME_DATA,
      firstName: '{{{highlights}}}',
      highlights: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('onerror=alert(1)>\n</h1>');
    expect(html).toContain('Welcome aboard, {{{highlights}}}');
  });

  it('throws on a missing variable rather than sending a half-rendered email', async () => {
    const withoutName: Record<string, string> = { ...WELCOME_DATA };
    delete withoutName.firstName;
    await expect(renderTemplate('welcome', withoutName)).rejects.toThrow(/Missing template variable: firstName/);
  });

  it('throws on an unknown template name', async () => {
    await expect(renderTemplate('does-not-exist', {})).rejects.toThrow(/Template not found/);
  });
});
