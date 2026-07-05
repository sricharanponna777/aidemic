import type {
  PlotBarData,
  PlotBoxPlotData,
  PlotCategoryValue,
  PlotChartType,
  PlotFrequencyPolygonData,
  PlotHistogramBar,
  PlotHistogramData,
  PlotLineData,
  PlotPieData,
  PlotScatterData,
  PlotSpec,
  PlotStemLeafData,
} from '@/types';
import { deriveAxisFromValues } from '@/lib/plot/scale';
import { txt } from './text';

const PLOT_CHART_TYPES: PlotChartType[] = [
  'pie',
  'bar',
  'line',
  'scatter',
  'histogram',
  'frequencyPolygon',
  'stemLeaf',
  'boxPlot',
];

const num = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const numArray = (value: unknown, min: number, max: number): number[] | null => {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const item of value) {
    const n = num(item);
    if (n === null) return null;
    out.push(n);
  }
  return out.length >= min && out.length <= max ? out : null;
};

const pointArray = (value: unknown, min: number, max: number): { x: number; y: number }[] | null => {
  if (!Array.isArray(value)) return null;
  const out: { x: number; y: number }[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const x = num((item as Record<string, unknown>).x);
    const y = num((item as Record<string, unknown>).y);
    if (x === null || y === null) return null;
    out.push({ x, y });
  }
  return out.length >= min && out.length <= max ? out : null;
};

const strArray = (value: unknown, min: number, max: number, maxLength: number): string[] | null => {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    const s = txt(String(item ?? ''), maxLength);
    if (!s) return null;
    out.push(s);
  }
  return out.length >= min && out.length <= max ? out : null;
};

const normalizePie = (raw: unknown): PlotPieData | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.categories)) return null;

  const categories: PlotCategoryValue[] = [];
  for (const item of record.categories) {
    if (!item || typeof item !== 'object') return null;
    const label = txt(String((item as Record<string, unknown>).label ?? ''), 80);
    const value = num((item as Record<string, unknown>).value);
    if (!label || value === null || value <= 0) return null;
    categories.push({ label, value });
  }
  if (categories.length < 2 || categories.length > 8) return null;

  const correctAngles = numArray(record.correctAngles, categories.length, categories.length);
  if (!correctAngles) return null;
  const sum = correctAngles.reduce((a, b) => a + b, 0);
  if (sum < 355 || sum > 365) return null;

  return { categories, correctAngles };
};

const normalizeBar = (raw: unknown): PlotBarData | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const categories = strArray(record.categories, 2, 10, 60);
  if (!categories) return null;
  const correctValues = numArray(record.correctValues, categories.length, categories.length);
  if (!correctValues) return null;
  const yAxisLabel = txt(String(record.yAxisLabel ?? ''), 60);
  if (!yAxisLabel) return null;
  const yAxis = deriveAxisFromValues(correctValues);
  const yAxisMax = yAxis.max;
  const yAxisStep = yAxis.step;
  if (correctValues.some((v) => v < 0 || v > yAxisMax)) return null;

  return { categories, correctValues, yAxisLabel, yAxisMax, yAxisStep };
};

const normalizeLine = (raw: unknown): PlotLineData | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const xLabel = txt(String(record.xLabel ?? ''), 60);
  const yLabel = txt(String(record.yLabel ?? ''), 60);
  const points = pointArray(record.points, 2, 15);
  if (!xLabel || !yLabel || !points) return null;
  const correctYValues = numArray(record.correctYValues, points.length, points.length);
  if (!correctYValues) return null;
  const yAxis = deriveAxisFromValues(correctYValues);
  const yAxisMax = yAxis.max;
  const yAxisStep = yAxis.step;

  const requiresBestFit = Boolean(record.requiresBestFit);
  const fitShape = record.fitShape;
  if (fitShape !== 'line' && fitShape !== 'curve' && fitShape !== 'none') return null;
  if (requiresBestFit && fitShape === 'none') return null;
  const fitDescription = txt(String(record.fitDescription ?? ''), 300);

  return { xLabel, yLabel, points, correctYValues, yAxisMax, yAxisStep, requiresBestFit, fitShape, fitDescription };
};

const normalizeScatter = (raw: unknown): PlotScatterData | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const xLabel = txt(String(record.xLabel ?? ''), 60);
  const yLabel = txt(String(record.yLabel ?? ''), 60);
  const givenPoints = pointArray(record.givenPoints, 4, 15);
  const fitShape = record.fitShape;
  if (!xLabel || !yLabel || !givenPoints || (fitShape !== 'line' && fitShape !== 'curve' && fitShape !== 'none')) return null;
  const fitDescription = txt(String(record.fitDescription ?? ''), 300);
  const connectPoints = Boolean(record.connectPoints);
  const xAxisMax = deriveAxisFromValues(givenPoints.map((p) => p.x)).max;
  const yAxisMax = deriveAxisFromValues(givenPoints.map((p) => p.y)).max;

  return { xLabel, yLabel, givenPoints, fitShape, fitDescription, connectPoints, xAxisMax, yAxisMax };
};

const normalizeHistogram = (raw: unknown): PlotHistogramData | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.bars)) return null;

  const bars: PlotHistogramBar[] = [];
  for (const item of record.bars) {
    if (!item || typeof item !== 'object') return null;
    const bar = item as Record<string, unknown>;
    const classStart = num(bar.classStart);
    const classEnd = num(bar.classEnd);
    const frequency = num(bar.frequency);
    const correctFrequencyDensity = num(bar.correctFrequencyDensity);
    if (classStart === null || classEnd === null || frequency === null || correctFrequencyDensity === null) return null;
    if (classEnd <= classStart || frequency < 0) return null;
    const expectedDensity = frequency / (classEnd - classStart);
    if (Math.abs(expectedDensity - correctFrequencyDensity) > Math.max(0.05, expectedDensity * 0.05)) return null;
    bars.push({ classStart, classEnd, frequency, correctFrequencyDensity });
  }
  if (bars.length < 3) return null;

  const xLabel = txt(String(record.xLabel ?? ''), 60);
  const yLabel = txt(String(record.yLabel ?? ''), 60);
  if (!xLabel || !yLabel) return null;

  return { bars, xLabel, yLabel };
};

const normalizeFrequencyPolygon = (raw: unknown): PlotFrequencyPolygonData | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const classStart = numArray(record.classStart, 3, 12);
  if (!classStart) return null;
  const classEnd = numArray(record.classEnd, classStart.length, classStart.length);
  const frequency = numArray(record.frequency, classStart.length, classStart.length);
  if (!classEnd || !frequency) return null;
  if (classStart.some((start, i) => classEnd[i] <= start)) return null;
  if (frequency.some((f) => f < 0)) return null;
  const xLabel = txt(String(record.xLabel ?? ''), 60);
  const yLabel = txt(String(record.yLabel ?? ''), 60);
  if (!xLabel || !yLabel) return null;

  return { classStart, classEnd, frequency, xLabel, yLabel };
};

const normalizeStemLeaf = (raw: unknown): PlotStemLeafData | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const stemUnit = num(record.stemUnit);
  const leafUnit = num(record.leafUnit);
  const rawValues = numArray(record.rawValues, 5, 30);
  if (stemUnit === null || leafUnit === null || stemUnit <= 0 || leafUnit <= 0 || !rawValues) return null;
  if (!Array.isArray(record.correctRows)) return null;

  const correctRows: { stem: number; leaves: number[] }[] = [];
  for (const item of record.correctRows) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    const stem = num(row.stem);
    const leaves = numArray(row.leaves, 0, 30);
    if (stem === null || !leaves) return null;
    if (leaves.some((leaf) => leaf < 0 || leaf > 9)) return null;
    for (let i = 1; i < leaves.length; i += 1) {
      if (leaves[i] < leaves[i - 1]) return null;
    }
    correctRows.push({ stem, leaves });
  }
  if (correctRows.length === 0) return null;

  const key = txt(String(record.key ?? ''), 120);
  if (!key) return null;

  return { stemUnit, leafUnit, rawValues, correctRows, key };
};

/** Some providers (notably Gemini via OpenRouter) don't reliably follow deeply nested
 * strict JSON schemas — they commonly flatten correctValues to a positional 5-number
 * array instead of the {min, lowerQuartile, ...} object the schema asks for. Accept
 * both shapes rather than rejecting otherwise-usable AI output. */
const toBoxPlotValues = (raw: unknown): PlotBoxPlotData['correctValues'] | null => {
  if (Array.isArray(raw)) {
    if (raw.length !== 5) return null;
    const nums = raw.map((item) => num(item));
    if (nums.some((n) => n === null)) return null;
    const [min, lowerQuartile, median, upperQuartile, max] = nums as number[];
    return { min, lowerQuartile, median, upperQuartile, max };
  }
  if (raw && typeof raw === 'object') {
    const v = raw as Record<string, unknown>;
    const min = num(v.min);
    const lowerQuartile = num(v.lowerQuartile ?? v.q1);
    const median = num(v.median);
    const upperQuartile = num(v.upperQuartile ?? v.q3);
    const max = num(v.max);
    if (min === null || lowerQuartile === null || median === null || upperQuartile === null || max === null) return null;
    return { min, lowerQuartile, median, upperQuartile, max };
  }
  return null;
};

const normalizeBoxPlot = (raw: unknown): PlotBoxPlotData | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const correctValues = toBoxPlotValues(record.correctValues);
  if (!correctValues) return null;
  const { min, lowerQuartile, median, upperQuartile, max } = correctValues;
  if (!(min <= lowerQuartile && lowerQuartile <= median && median <= upperQuartile && upperQuartile <= max)) return null;

  // Derive sensible axis bounds from the data whenever the AI omits or misplaces them,
  // rather than rejecting an otherwise-valid answer over a missing display detail.
  const range = Math.max(max - min, 1);
  const padding = Math.max(range * 0.15, 1);
  const providedMin = num(record.axisMin);
  const providedMax = num(record.axisMax);
  const axisMin = providedMin !== null && providedMin <= min ? providedMin : Math.floor(min - padding);
  const axisMax = providedMax !== null && providedMax >= max ? providedMax : Math.ceil(max + padding);
  const axisLabel = txt(String(record.axisLabel ?? ''), 60) || 'Value';
  const rawDataOrDescription = txt(String(record.rawDataOrDescription ?? ''), 900);

  return { axisLabel, axisMin, axisMax, correctValues, rawDataOrDescription };
};

const numberField = { type: 'number' } as const;
const stringField = { type: 'string' } as const;
const pointItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['x', 'y'],
  properties: { x: numberField, y: numberField },
} as const;

/** Strict JSON Schema fragment for the `plotSpec` field, shared by generate-questions
 * (asks the AI to produce it) and mark-answers (re-validates it on the way back in).
 * OpenAI's strict:true mode has no oneOf/anyOf, so every sub-object must always be
 * present in the schema (nullable) exactly like `options`/`correctOption` are always
 * present-but-empty for 'open' questions today. */
export const PLOT_SPEC_JSON_SCHEMA = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['chartType', 'pie', 'bar', 'line', 'scatter', 'histogram', 'frequencyPolygon', 'stemLeaf', 'boxPlot'],
  properties: {
    chartType: { type: 'string', enum: PLOT_CHART_TYPES },
    pie: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['categories', 'correctAngles'],
      properties: {
        categories: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'value'],
            properties: { label: stringField, value: numberField },
          },
        },
        correctAngles: { type: 'array', items: numberField },
      },
    },
    bar: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['categories', 'correctValues', 'yAxisLabel', 'yAxisMax', 'yAxisStep'],
      properties: {
        categories: { type: 'array', items: stringField },
        correctValues: { type: 'array', items: numberField },
        yAxisLabel: stringField,
        yAxisMax: numberField,
        yAxisStep: numberField,
      },
    },
    line: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['xLabel', 'yLabel', 'points', 'correctYValues', 'yAxisMax', 'yAxisStep', 'requiresBestFit', 'fitShape', 'fitDescription'],
      properties: {
        xLabel: stringField,
        yLabel: stringField,
        points: { type: 'array', items: pointItemSchema },
        correctYValues: { type: 'array', items: numberField },
        yAxisMax: numberField,
        yAxisStep: numberField,
        requiresBestFit: { type: 'boolean' },
        fitShape: { type: 'string', enum: ['line', 'curve', 'none'] },
        fitDescription: stringField,
      },
    },
    scatter: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['xLabel', 'yLabel', 'givenPoints', 'fitShape', 'fitDescription', 'connectPoints', 'xAxisMax', 'yAxisMax'],
      properties: {
        xLabel: stringField,
        yLabel: stringField,
        givenPoints: { type: 'array', items: pointItemSchema },
        fitShape: { type: 'string', enum: ['line', 'curve', 'none'] },
        fitDescription: stringField,
        connectPoints: { type: 'boolean' },
        xAxisMax: numberField,
        yAxisMax: numberField,
      },
    },
    histogram: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['bars', 'xLabel', 'yLabel'],
      properties: {
        bars: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['classStart', 'classEnd', 'frequency', 'correctFrequencyDensity'],
            properties: { classStart: numberField, classEnd: numberField, frequency: numberField, correctFrequencyDensity: numberField },
          },
        },
        xLabel: stringField,
        yLabel: stringField,
      },
    },
    frequencyPolygon: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['classStart', 'classEnd', 'frequency', 'xLabel', 'yLabel'],
      properties: {
        classStart: { type: 'array', items: numberField },
        classEnd: { type: 'array', items: numberField },
        frequency: { type: 'array', items: numberField },
        xLabel: stringField,
        yLabel: stringField,
      },
    },
    stemLeaf: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['stemUnit', 'leafUnit', 'rawValues', 'correctRows', 'key'],
      properties: {
        stemUnit: numberField,
        leafUnit: numberField,
        rawValues: { type: 'array', items: numberField },
        correctRows: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['stem', 'leaves'],
            properties: { stem: numberField, leaves: { type: 'array', items: numberField } },
          },
        },
        key: stringField,
      },
    },
    boxPlot: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['axisLabel', 'axisMin', 'axisMax', 'correctValues', 'rawDataOrDescription'],
      properties: {
        axisLabel: stringField,
        axisMin: numberField,
        axisMax: numberField,
        correctValues: {
          type: 'object',
          additionalProperties: false,
          required: ['min', 'lowerQuartile', 'median', 'upperQuartile', 'max'],
          properties: { min: numberField, lowerQuartile: numberField, median: numberField, upperQuartile: numberField, max: numberField },
        },
        rawDataOrDescription: stringField,
      },
    },
  },
} as const;

/** Validates and coerces a raw plotSpec value from AI output (or a stored/replayed question)
 * into a strict PlotSpec, or null if it doesn't hold together — callers should downgrade the
 * question to 'open' rather than discard it, mirroring the malformed-MCQ downgrade pattern. */
export const normalizePlotSpec = (raw: unknown): PlotSpec | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  // Providers with looser structured-output support (observed with Gemini via OpenRouter)
  // sometimes omit the chartType discriminant entirely. Infer it from whichever of the 8
  // sub-objects is actually populated as an object.
  let chartType = typeof record.chartType === 'string' ? record.chartType : '';
  if (!PLOT_CHART_TYPES.includes(chartType as PlotChartType)) {
    const populatedKey = PLOT_CHART_TYPES.find((key) => record[key] && typeof record[key] === 'object');
    chartType = populatedKey ?? '';
  }
  if (!PLOT_CHART_TYPES.includes(chartType as PlotChartType)) return null;

  // Providers also sometimes flatten every chart type's fields onto the top-level
  // plotSpec object instead of nesting them under e.g. plotSpec.boxPlot. Fall back to
  // the raw object itself as the per-type payload when the nested key isn't an object.
  const nested = record[chartType];
  const payload = nested && typeof nested === 'object' ? nested : record;

  const spec: PlotSpec = {
    chartType: chartType as PlotChartType,
    pie: null,
    bar: null,
    line: null,
    scatter: null,
    histogram: null,
    frequencyPolygon: null,
    stemLeaf: null,
    boxPlot: null,
  };

  switch (spec.chartType) {
    case 'pie':
      spec.pie = normalizePie(payload);
      return spec.pie ? spec : null;
    case 'bar':
      spec.bar = normalizeBar(payload);
      return spec.bar ? spec : null;
    case 'line':
      spec.line = normalizeLine(payload);
      return spec.line ? spec : null;
    case 'scatter':
      spec.scatter = normalizeScatter(payload);
      return spec.scatter ? spec : null;
    case 'histogram':
      spec.histogram = normalizeHistogram(payload);
      return spec.histogram ? spec : null;
    case 'frequencyPolygon':
      spec.frequencyPolygon = normalizeFrequencyPolygon(payload);
      return spec.frequencyPolygon ? spec : null;
    case 'stemLeaf':
      spec.stemLeaf = normalizeStemLeaf(payload);
      return spec.stemLeaf ? spec : null;
    case 'boxPlot':
      spec.boxPlot = normalizeBoxPlot(payload);
      return spec.boxPlot ? spec : null;
    default:
      return null;
  }
};
