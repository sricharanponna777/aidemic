import type {
  DiagramConnection,
  DiagramKind,
  DiagramNode,
  DiagramPrimitive,
  DiagramPrimitiveKind,
  DiagramSpec,
} from '@/types';
import { cleanText, txt } from './text';

const PRIMITIVE_KINDS: DiagramPrimitiveKind[] = ['path', 'line', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'text'];

const MAX_NODES = 30;
const MAX_CONNECTIONS = 40;
const MAX_PRIMITIVES = 120;
const MAX_LABEL_BANK = 24;
const MAX_POINTS = 60; // 30 (x,y) pairs

// Colours the AI may reference by name; anything else must be a #hex literal, else we
// fall back to a safe default. No url()/expression/gradient references can slip through.
const NAMED_COLORS = new Set([
  'black', 'white', 'red', 'green', 'blue', 'orange', 'yellow', 'purple', 'brown',
  'grey', 'gray', 'pink', 'cyan', 'magenta', 'teal', 'navy', 'lime', 'olive', 'maroon',
  'silver', 'gold', 'none', 'transparent', 'currentcolor',
]);

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// Path data whitelist: SVG path command letters plus numbers and separators only.
// Rejects anything that could carry markup, url(), or scripting.
const SAFE_PATH_DATA = /^[MLHVCSQTAZmlhvcsqtaz0-9.,\s+\-eE]+$/;

const num = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const coord = (value: unknown): number => {
  const n = num(value);
  if (n === null) return 0;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
};

const positive = (value: unknown, fallback: number): number => {
  const n = num(value);
  if (n === null || n <= 0) return fallback;
  return Math.min(100, Math.round(n * 100) / 100);
};

const color = (value: unknown, fallback: string): string => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return fallback;
  if (HEX_COLOR.test(raw)) return raw;
  if (NAMED_COLORS.has(raw.toLowerCase())) return raw;
  return fallback;
};

const sanitizeId = (value: unknown): string =>
  String(value ?? '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 40);

const kindOf = (value: unknown): DiagramKind => (String(value ?? '').toLowerCase() === 'pictorial' ? 'pictorial' : 'structural');

const normalizePrimitive = (raw: unknown): DiagramPrimitive | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const kind = String(record.kind ?? '').toLowerCase() as DiagramPrimitiveKind;
  if (!PRIMITIVE_KINDS.includes(kind)) return null;

  const stroke = color(record.stroke, 'currentColor');
  const fill = color(record.fill, kind === 'path' || kind === 'polygon' ? 'none' : 'none');
  const strokeWidth = (() => {
    const n = num(record.strokeWidth);
    return n === null || n <= 0 ? 1 : Math.min(6, n);
  })();

  const base: DiagramPrimitive = {
    kind,
    d: '',
    points: [],
    cx: 0,
    cy: 0,
    r: 0,
    rx: 0,
    ry: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    text: '',
    fontSize: 4,
    stroke,
    fill,
    strokeWidth,
  };

  switch (kind) {
    case 'path': {
      const d = txt(String(record.d ?? ''), 4000);
      if (!d || !SAFE_PATH_DATA.test(d) || !/^[Mm]/.test(d.trim())) return null;
      return { ...base, d };
    }
    case 'line':
      return { ...base, x1: coord(record.x1), y1: coord(record.y1), x2: coord(record.x2), y2: coord(record.y2) };
    case 'circle': {
      const r = positive(record.r, 0);
      if (r <= 0) return null;
      return { ...base, cx: coord(record.cx), cy: coord(record.cy), r };
    }
    case 'ellipse': {
      const rx = positive(record.rx, 0);
      const ry = positive(record.ry, 0);
      if (rx <= 0 || ry <= 0) return null;
      return { ...base, cx: coord(record.cx), cy: coord(record.cy), rx, ry };
    }
    case 'rect': {
      const width = positive(record.width, 0);
      const height = positive(record.height, 0);
      if (width <= 0 || height <= 0) return null;
      return { ...base, x: coord(record.x), y: coord(record.y), width, height };
    }
    case 'polygon':
    case 'polyline': {
      if (!Array.isArray(record.points)) return null;
      const points = record.points.map((p) => coord(p)).slice(0, MAX_POINTS);
      // need at least 2 (x,y) pairs
      if (points.length < 4 || points.length % 2 !== 0) return null;
      return { ...base, points };
    }
    case 'text': {
      const text = cleanText(String(record.text ?? ''), 120);
      if (!text) return null;
      const fontSize = (() => {
        const n = num(record.fontSize);
        return n === null || n <= 0 ? 4 : Math.min(12, n);
      })();
      return { ...base, x: coord(record.x), y: coord(record.y), text, fontSize, fill: color(record.fill, 'currentColor') };
    }
    default:
      return null;
  }
};

const MAX_ACCEPTABLE_LABELS = 8;

// Extra answers the AI may mark correct alongside `correctLabel` (synonyms / alternative
// spellings). Cleaned, de-duplicated case-insensitively (also against the correct label), capped.
const acceptableLabelsOf = (raw: unknown, correctLabel: string): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>([correctLabel.toLowerCase()]);
  for (const item of raw) {
    if (out.length >= MAX_ACCEPTABLE_LABELS) break;
    const clean = cleanText(String(item ?? ''), 80);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
};

const normalizeNode = (raw: unknown): DiagramNode | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = sanitizeId(record.id);
  const correctLabel = cleanText(String(record.correctLabel ?? ''), 80);
  if (!id || !correctLabel) return null;
  return {
    id,
    x: coord(record.x),
    y: coord(record.y),
    correctLabel,
    acceptableLabels: acceptableLabelsOf(record.acceptableLabels, correctLabel),
    given: Boolean(record.given),
    role: 'label', // freehand-authored nodes are always labellable callouts; anchor nodes are template-only
  };
};

const normalizeConnection = (raw: unknown, nodeIds: Set<string>): DiagramConnection | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const from = sanitizeId(record.from);
  const to = sanitizeId(record.to);
  if (!from || !to || from === to || !nodeIds.has(from) || !nodeIds.has(to)) return null;
  return {
    from,
    to,
    directed: Boolean(record.directed),
    label: cleanText(String(record.label ?? ''), 60),
    given: Boolean(record.given),
    style: 'solid', // freehand connections have no dashed-style concept; template-only
  };
};

/** Strict JSON Schema fragment for the `diagramSpec` field, shared by generate-questions
 * (asks the AI to produce it) and mark-answers (re-validates it on the way back in).
 * Like PLOT_SPEC_JSON_SCHEMA, every primitive field is always present (strict:true has no
 * oneOf) — the normalizer keeps only the fields relevant to each primitive's `kind`. */
const numberField = { type: 'number' } as const;
const stringField = { type: 'string' } as const;

export const DIAGRAM_SPEC_JSON_SCHEMA = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['kind', 'title', 'primitives', 'nodes', 'connections', 'labelBank'],
  properties: {
    kind: { type: 'string', enum: ['structural', 'pictorial'] },
    title: stringField,
    primitives: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'kind', 'd', 'points', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height',
          'x1', 'y1', 'x2', 'y2', 'text', 'fontSize', 'stroke', 'fill', 'strokeWidth',
        ],
        properties: {
          kind: { type: 'string', enum: PRIMITIVE_KINDS },
          d: stringField,
          points: { type: 'array', items: numberField },
          cx: numberField,
          cy: numberField,
          r: numberField,
          rx: numberField,
          ry: numberField,
          x: numberField,
          y: numberField,
          width: numberField,
          height: numberField,
          x1: numberField,
          y1: numberField,
          x2: numberField,
          y2: numberField,
          text: stringField,
          fontSize: numberField,
          stroke: stringField,
          fill: stringField,
          strokeWidth: numberField,
        },
      },
    },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'x', 'y', 'correctLabel', 'acceptableLabels', 'given'],
        properties: {
          id: stringField,
          x: numberField,
          y: numberField,
          correctLabel: stringField,
          acceptableLabels: { type: 'array', items: stringField },
          given: { type: 'boolean' },
        },
      },
    },
    connections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'directed', 'label', 'given'],
        properties: {
          from: stringField,
          to: stringField,
          directed: { type: 'boolean' },
          label: stringField,
          given: { type: 'boolean' },
        },
      },
    },
    labelBank: { type: 'array', items: stringField },
  },
} as const;

/** Validates and coerces a raw diagramSpec from AI output (or a stored/replayed question)
 * into a strict DiagramSpec, or null if there is nothing answerable — callers downgrade the
 * question to 'open' rather than discard it, mirroring the malformed-plotSpec/MCQ pattern. */
export const normalizeDiagramSpec = (raw: unknown): DiagramSpec | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const nodes: DiagramNode[] = [];
  const seenIds = new Set<string>();
  if (Array.isArray(record.nodes)) {
    for (const item of record.nodes) {
      if (nodes.length >= MAX_NODES) break;
      const node = normalizeNode(item);
      if (!node || seenIds.has(node.id)) continue;
      seenIds.add(node.id);
      nodes.push(node);
    }
  }
  if (nodes.length === 0) return null;

  const connections: DiagramConnection[] = [];
  const seenEdges = new Set<string>();
  if (Array.isArray(record.connections)) {
    for (const item of record.connections) {
      if (connections.length >= MAX_CONNECTIONS) break;
      const connection = normalizeConnection(item, seenIds);
      if (!connection) continue;
      const key = `${connection.from}->${connection.to}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      connections.push(connection);
    }
  }

  const primitives: DiagramPrimitive[] = [];
  if (Array.isArray(record.primitives)) {
    for (const item of record.primitives) {
      if (primitives.length >= MAX_PRIMITIVES) break;
      const primitive = normalizePrimitive(item);
      if (primitive) primitives.push(primitive);
    }
  }

  // There must be something for the student to do: at least one blank label OR one
  // connection to draw. Otherwise the "unfinished" diagram is already complete.
  const hasBlankNode = nodes.some((node) => !node.given);
  const hasBlankConnection = connections.some((connection) => !connection.given);
  if (!hasBlankNode && !hasBlankConnection) return null;

  // Ensure every blank node's answer is offered in the word bank, then add any AI-supplied
  // distractors on top (deduped, capped).
  const bank: string[] = [];
  const seenBank = new Set<string>();
  const pushBank = (label: string) => {
    const clean = cleanText(label, 80);
    const key = clean.toLowerCase();
    if (!clean || seenBank.has(key) || bank.length >= MAX_LABEL_BANK) return;
    seenBank.add(key);
    bank.push(clean);
  };
  nodes.filter((node) => !node.given).forEach((node) => pushBank(node.correctLabel));
  if (Array.isArray(record.labelBank)) {
    for (const item of record.labelBank) pushBank(String(item ?? ''));
  }

  return {
    kind: kindOf(record.kind),
    title: cleanText(String(record.title ?? ''), 160),
    primitives,
    nodes,
    connections,
    slots: [], // freehand diagrams never use the slot interaction; template-only
    labelBank: bank,
  };
};
