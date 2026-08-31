import fs from 'fs';
import path from 'path';

type TemplateData = Record<string, string | number | boolean>;

interface RenderedEmail {
  subject: string;
  html: string;
}

const TEMPLATES_DIR = path.join(process.cwd(), 'src', 'emails', 'templates');
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

let cachedManifest: Record<string, Record<string, string>> | null = null;

function getBrevoConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const from = process.env.BREVO_SMTP_FROM?.trim();

  if (!apiKey || !from) {
    return null;
  }

  return { apiKey, from };
}

function getManifest(): Record<string, Record<string, string>> {
  if (cachedManifest) return cachedManifest;

  const manifestPath = path.join(TEMPLATES_DIR, 'manifest.json');
  const content = fs.readFileSync(manifestPath, 'utf-8');
  cachedManifest = JSON.parse(content) as Record<string, Record<string, string>>;
  return cachedManifest;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char] || char;
  });
}

/**
 * Substitutes `{{{raw}}}` and `{{escaped}}` in a single left-to-right pass.
 *
 * One pass is the whole point: running the escaped pass and the raw pass in
 * sequence lets a substituted *value* be re-scanned by the next one, so a
 * display name of `{{{highlights}}}` would expand into that slot's unescaped
 * HTML. Because the alternation is matched in one traversal, replacements are
 * never revisited.
 *
 * `escapeVars: false` renders both forms verbatim -- for plain-text targets
 * like the Subject header, where HTML entities would show up literally.
 */
function interpolate(template: string, data: TemplateData, escapeVars = true): string {
  return template.replace(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g, (match, rawKey, escapedKey) => {
    const key = rawKey ?? escapedKey;
    const value = data[key];
    if (value === undefined) {
      throw new Error(`Missing template variable: ${key}`);
    }
    const str = String(value);
    // The triple-brace form is raw by contract; only the double-brace form escapes.
    return rawKey !== undefined || !escapeVars ? str : escapeHtml(str);
  });
}

export async function renderTemplate(templateName: string, data: TemplateData): Promise<RenderedEmail> {
  const manifest = getManifest();
  const templateConfig = manifest[templateName];

  if (!templateConfig) {
    throw new Error(`Template not found: ${templateName}`);
  }

  // Add default variables
  const year = new Date().getFullYear();
  const enrichedData = {
    ...data,
    year,
  };

  // Read layout and template
  const layoutPath = path.join(TEMPLATES_DIR, `${templateConfig.layout}.html`);
  const templatePath = path.join(TEMPLATES_DIR, `${templateName}.html`);

  const layout = fs.readFileSync(layoutPath, 'utf-8');
  const content = fs.readFileSync(templatePath, 'utf-8');

  // Interpolate the body, then drop the result into the layout's raw
  // {{{content}}} slot. The layout pass must run over already-rendered content,
  // so it is passed as the slot value rather than re-scanned.
  const interpolatedContent = interpolate(content, enrichedData);
  const html = interpolate(layout, { ...enrichedData, content: interpolatedContent });

  // The Subject is a plain-text mail header, not markup: escaping it here is
  // what puts a literal `O&#39;Brien` in the recipient's inbox.
  const subject = interpolate(templateConfig.subject, enrichedData, false);

  return { subject, html };
}

export async function sendEmail(input: {
  to: string;
  template: string;
  data: TemplateData;
  subject?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const config = getBrevoConfig();
  if (!config) {
    console.warn(`[email] skipped "${input.template}": Brevo API key not configured`);
    return { ok: false, error: 'Brevo API not configured' };
  }

  try {
    const rendered = await renderTemplate(input.template, input.data);
    const subject = input.subject || rendered.subject;

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: parseFromAddress(config.from),
        to: [{ email: input.to }],
        subject,
        htmlContent: rendered.html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`[email] "${input.template}" failed: HTTP ${response.status} ${detail}`);
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    console.log(`[email] "${input.template}" sent to ${input.to} (${data.messageId})`);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[email] "${input.template}" failed:`, message);
    return { ok: false, error: message };
  }
}

// Brevo is called concurrently but never more than this many at a time: sending a
// 100-parent digest strictly in sequence took 100 round-trips end to end, while an
// unbounded Promise.all would fire 100 at once and trip Brevo's own rate limiting.
const BULK_SEND_CONCURRENCY = 5;

type BulkResult = { to: string; status: 'sent' | 'failed'; error?: string };

async function sendOne(
  msg: { to: string; template: string; data: TemplateData },
  config: { apiKey: string; from: string }
): Promise<BulkResult> {
  try {
    const rendered = await renderTemplate(msg.template, msg.data);

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: parseFromAddress(config.from),
        to: [{ email: msg.to }],
        subject: rendered.subject,
        htmlContent: rendered.html,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`[email-bulk] sent to ${msg.to} (${data.messageId})`);
      return { to: msg.to, status: 'sent' };
    }

    const errorMsg = await response.text().catch(() => `HTTP ${response.status}`);
    console.error(`[email-bulk] failed for ${msg.to}: ${errorMsg}`);
    return { to: msg.to, status: 'failed', error: errorMsg };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[email-bulk] failed for ${msg.to}:`, errorMsg);
    return { to: msg.to, status: 'failed', error: errorMsg };
  }
}

export async function sendBulkEmail(input: {
  messages: Array<{
    to: string;
    template: string;
    data: TemplateData;
  }>;
}): Promise<{
  ok: boolean;
  total: number;
  sent: number;
  failed: number;
  results: BulkResult[];
}> {
  const config = getBrevoConfig();
  if (!config) {
    return {
      ok: false,
      total: input.messages.length,
      sent: 0,
      failed: input.messages.length,
      results: input.messages.map((msg) => ({
        to: msg.to,
        status: 'failed' as const,
        error: 'Brevo API not configured',
      })),
    };
  }

  // Results are written by index, so the response stays in request order however
  // the concurrent sends happen to interleave.
  const results = new Array<BulkResult>(input.messages.length);
  let next = 0;

  const worker = async () => {
    while (next < input.messages.length) {
      const index = next;
      next += 1;
      results[index] = await sendOne(input.messages[index]!, config);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(BULK_SEND_CONCURRENCY, input.messages.length) }, worker)
  );

  const sent = results.filter((r) => r.status === 'sent').length;
  const failed = results.length - sent;

  return {
    ok: failed === 0,
    total: input.messages.length,
    sent,
    failed,
    results,
  };
}

export function isMailerConfigured(): boolean {
  return getBrevoConfig() !== null;
}

export function getMissingMailerEnv(): string[] {
  const required = ['BREVO_API_KEY', 'BREVO_SMTP_FROM'] as const;
  return required.filter((name) => !process.env[name]?.trim());
}

function parseFromAddress(from: string): { name?: string; email: string } {
  // Parse "Name <email@example.com>" or just "email@example.com"
  const parsed = from.match(/^(.+?)\s*<(.+?)>$/);
  if (parsed?.[1] && parsed?.[2]) {
    return { name: parsed[1].trim(), email: parsed[2].trim() };
  }
  return { email: from };
}
