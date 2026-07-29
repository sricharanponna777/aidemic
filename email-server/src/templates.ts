import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { HttpError } from './errors.js';

const TEMPLATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates');

/** `{{{ raw }}}` interpolates as-is, `{{ escaped }}` is HTML-escaped. */
const PLACEHOLDER = /\{\{\{\s*(\w+)\s*\}\}\}|\{\{\s*(\w+)\s*\}\}/g;

const manifestSchema = z.record(
  z.string(),
  z.object({
    subject: z.string().min(1),
    description: z.string().min(1),
    /** Optional shell (a `_`-prefixed file) that receives the body as `content`. */
    layout: z.string().optional(),
  }),
);

export type TemplateValue = string | number | boolean;

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface TemplateInfo {
  name: string;
  description: string;
  subject: string;
  variables: string[];
}

const manifest = manifestSchema.parse(
  JSON.parse(readFileSync(path.join(TEMPLATE_DIR, 'manifest.json'), 'utf8')),
);

const files = new Map(
  readdirSync(TEMPLATE_DIR)
    .filter((file) => file.endsWith('.html'))
    .map((file) => [file.replace(/\.html$/, ''), readFileSync(path.join(TEMPLATE_DIR, file), 'utf8')]),
);

for (const [name, entry] of Object.entries(manifest)) {
  if (!files.has(name)) throw new Error(`Template "${name}" is in manifest.json but ${name}.html is missing.`);
  if (entry.layout && !files.has(entry.layout)) {
    throw new Error(`Template "${name}" references missing layout "${entry.layout}".`);
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `escape` is off for the subject, which is a plain-text header rather than markup. */
function substitute(
  source: string,
  data: Record<string, TemplateValue>,
  missing: Set<string>,
  escape = true,
) {
  return source.replace(PLACEHOLDER, (_match, rawKey: string | undefined, escapedKey: string | undefined) => {
    const key = (rawKey ?? escapedKey) as string;
    const value = data[key];
    if (value === undefined) {
      missing.add(key);
      return '';
    }
    return escape && !rawKey ? escapeHtml(String(value)) : String(value);
  });
}

function placeholdersIn(source: string) {
  const found = new Set<string>();
  for (const match of source.matchAll(PLACEHOLDER)) found.add((match[1] ?? match[2]) as string);
  return found;
}

/** Values every template can rely on without the caller passing them. */
function defaults(): Record<string, TemplateValue> {
  return { year: new Date().getFullYear() };
}

function requireTemplate(name: string) {
  const entry = manifest[name];
  const html = files.get(name);
  if (!entry || !html) {
    throw HttpError.notFound(`Unknown template "${name}". Call GET /api/email/templates for the list.`);
  }
  return { entry, html };
}

/** The named entities the bundled templates use; numeric ones are decoded generically. */
const ENTITIES: Record<string, string> = {
  copy: '©',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

/** Converts rendered HTML into the plain-text alternative part. */
function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&(copy|mdash|ndash|hellip|lsquo|rsquo|ldquo|rdquo);/g, (_match, name: string) => ENTITIES[name] ?? '')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function listTemplates(): TemplateInfo[] {
  return Object.entries(manifest).map(([name, entry]) => ({
    name,
    description: entry.description,
    subject: entry.subject,
    variables: templateVariables(name),
  }));
}

/** Every placeholder the caller must supply, across the subject, body and layout. */
export function templateVariables(name: string): string[] {
  const { entry, html } = requireTemplate(name);
  const keys = new Set([...placeholdersIn(entry.subject), ...placeholdersIn(html)]);
  if (entry.layout) {
    for (const key of placeholdersIn(files.get(entry.layout) as string)) keys.add(key);
  }
  keys.delete('content');
  for (const key of Object.keys(defaults())) keys.delete(key);
  return [...keys].sort();
}

export function renderTemplate(
  name: string,
  data: Record<string, TemplateValue>,
  subjectOverride?: string,
): RenderedTemplate {
  const { entry, html } = requireTemplate(name);
  const values = { ...defaults(), ...data };
  const missing = new Set<string>();

  const subject = substitute(subjectOverride ?? entry.subject, values, missing, false);
  const body = substitute(html, values, missing);
  const rendered = entry.layout
    ? substitute(files.get(entry.layout) as string, { ...values, content: body }, missing)
    : body;

  if (missing.size > 0) {
    throw HttpError.badRequest(`Template "${name}" is missing data for: ${[...missing].sort().join(', ')}.`, {
      template: name,
      missing: [...missing].sort(),
      required: templateVariables(name),
    });
  }

  return { subject, html: rendered, text: htmlToText(rendered) };
}
