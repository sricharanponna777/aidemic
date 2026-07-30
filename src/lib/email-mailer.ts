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

function interpolate(template: string, data: TemplateData, escapeVars = true): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = data[key];
    if (value === undefined) {
      throw new Error(`Missing template variable: ${key}`);
    }
    const str = String(value);
    return escapeVars ? escapeHtml(str) : str;
  });
}

function interpolateRaw(template: string, data: TemplateData): string {
  return template.replace(/\{\{\{(\w+)\}\}\}/g, (match, key) => {
    const value = data[key];
    if (value === undefined) {
      throw new Error(`Missing template variable: ${key}`);
    }
    return String(value);
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

  // Interpolate template content first (supports both {{}} and {{{}}} syntax)
  const interpolatedContent = interpolateRaw(
    interpolate(content, enrichedData),
    enrichedData
  );

  // Create the final HTML with layout
  const finalData = {
    ...enrichedData,
    content: interpolatedContent,
  };

  // Interpolate layout (but preserve content as-is)
  let html = interpolate(layout, finalData);
  html = interpolateRaw(html, { content: interpolatedContent });

  // Interpolate subject
  const subject = interpolate(templateConfig.subject, enrichedData);

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
  results: Array<{
    to: string;
    status: 'sent' | 'failed';
    error?: string;
  }>;
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

  const results: Array<{
    to: string;
    status: 'sent' | 'failed';
    error?: string;
  }> = [];

  let sent = 0;
  let failed = 0;

  for (const msg of input.messages) {
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
        results.push({ to: msg.to, status: 'sent' });
        sent += 1;
        console.log(`[email-bulk] sent to ${msg.to} (${data.messageId})`);
      } else {
        const errorMsg = await response.text().catch(() => `HTTP ${response.status}`);
        results.push({ to: msg.to, status: 'failed', error: errorMsg });
        failed += 1;
        console.error(`[email-bulk] failed for ${msg.to}: ${errorMsg}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({ to: msg.to, status: 'failed', error: errorMsg });
      failed += 1;
      console.error(`[email-bulk] failed for ${msg.to}:`, errorMsg);
    }
  }

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
