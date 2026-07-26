import type { DiagramSpec, DiagramTemplateSelection } from '@/types';
import { expandDiagramTemplate } from '@/lib/diagrams/expand';
import { listDiagramTemplateIds, listDiagramTemplateMetadata } from '@/lib/diagrams/registry';
import { normalizeDiagramSpec } from './diagramSpec';
import { cleanText } from './text';

const MAX_STRING_PARAMS = 12;
const MAX_NUMBER_PARAMS = 12;
const MAX_LIST_PARAMS = 6;
const MAX_LIST_VALUES = 30;

const sanitizeKey = (value: unknown): string =>
  String(value ?? '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 40);

/** Strict JSON Schema fragment for the `diagramTemplate` field — a generic key/value parameter
 * bag (not per-template named fields) because OpenAI structured-output strict mode forbids
 * oneOf/conditional schemas. `templateId`'s enum is sourced from the template registry so the
 * schema and registry can never drift apart. */
export const DIAGRAM_TEMPLATE_JSON_SCHEMA = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['templateId', 'stringParams', 'numberParams', 'listParams'],
  properties: {
    templateId: { type: 'string', enum: ['', ...listDiagramTemplateIds()] },
    stringParams: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'value'],
        properties: { key: { type: 'string' }, value: { type: 'string' } },
      },
    },
    numberParams: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'value'],
        properties: { key: { type: 'string' }, value: { type: 'number' } },
      },
    },
    listParams: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'values'],
        properties: { key: { type: 'string' }, values: { type: 'array', items: { type: 'string' } } },
      },
    },
  },
} as const;

/** Builds the prompt-facing catalog text listing every available template, its params, and which
 * parts/slots/connections can be blanked — regenerated from the registry so new templates never
 * need a manual prompt update. */
export const buildDiagramTemplateCatalog = (): string =>
  listDiagramTemplateMetadata()
    .map((t) => `- templateId="${t.id}" (${t.category}): ${t.promptBlurb} ${t.paramDocs}`)
    .join('\n');

export const normalizeDiagramTemplateSelection = (raw: unknown): DiagramTemplateSelection | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const templateId = sanitizeKey(record.templateId);
  if (!templateId) return null;

  const stringParams = Array.isArray(record.stringParams)
    ? record.stringParams
        .slice(0, MAX_STRING_PARAMS)
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const entry = item as Record<string, unknown>;
          const key = sanitizeKey(entry.key);
          const value = cleanText(String(entry.value ?? ''), 80);
          return key ? { key, value } : null;
        })
        .filter((v): v is { key: string; value: string } => v !== null)
    : [];

  const numberParams = Array.isArray(record.numberParams)
    ? record.numberParams
        .slice(0, MAX_NUMBER_PARAMS)
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const entry = item as Record<string, unknown>;
          const key = sanitizeKey(entry.key);
          const value = typeof entry.value === 'number' && Number.isFinite(entry.value) ? entry.value : null;
          return key && value !== null ? { key, value } : null;
        })
        .filter((v): v is { key: string; value: number } => v !== null)
    : [];

  const listParams = Array.isArray(record.listParams)
    ? record.listParams
        .slice(0, MAX_LIST_PARAMS)
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const entry = item as Record<string, unknown>;
          const key = sanitizeKey(entry.key);
          const values = Array.isArray(entry.values) ? entry.values.map((v) => sanitizeKey(v)).filter(Boolean).slice(0, MAX_LIST_VALUES) : [];
          return key ? { key, values } : null;
        })
        .filter((v): v is { key: string; values: string[] } => v !== null)
    : [];

  return { templateId, stringParams, numberParams, listParams };
};

/** The single diagram-resolution entry point shared by generate-questions and mark-answers: if a
 * template selection is present and known, expand it deterministically via the template registry
 * (the AI's own diagramSpec, if any, is ignored — never trusted for templated categories);
 * otherwise fall back to the existing freehand normalizeDiagramSpec path unchanged. Never trusts
 * client-submitted geometry either way — both paths re-derive the spec from validated input. */
export const resolveDiagramSpec = (diagramSpecRaw: unknown, diagramTemplateRaw: unknown): DiagramSpec | null => {
  const selection = normalizeDiagramTemplateSelection(diagramTemplateRaw);
  if (selection && selection.templateId) {
    return expandDiagramTemplate(selection);
  }
  return normalizeDiagramSpec(diagramSpecRaw);
};
