import type { DiagramSpec, PlotSpec } from '@/types';

/**
 * Student-facing projections of PlotSpec / DiagramSpec.
 *
 * Both specs interleave the *question* (geometry, axes, given labels, given data)
 * with the *answer key* (correctLabel, correctValues, correctOption, ...), and the
 * assignment route used to hand the whole thing to the browser while an attempt was
 * still in progress -- so every answer was one devtools network tab away. These
 * helpers strip the answer-bearing fields while preserving everything the answer
 * inputs need to render.
 *
 * The originals stay server-side: marking re-reads questions_payload from the
 * database, and the review view (a completed attempt) still gets the full spec.
 */

// -- deterministic shuffle -------------------------------------------------
// The word bank is built as "every blank node's correct label, in node order,
// then distractors", so its ordering alone gives away the mapping. It has to be
// shuffled, but with a stable seed: reshuffling per request would reorder the
// bank under the student on every refresh.

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleDeterministic<T>(items: T[], seed: string): T[] {
  let state = hashSeed(seed) || 1;
  const next = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// -- plot ------------------------------------------------------------------

export function toStudentSafePlotSpec(spec: PlotSpec | null): PlotSpec | null {
  if (!spec) return null;

  const zeros = (n: number) => new Array<number>(n).fill(0);

  return {
    chartType: spec.chartType,
    pie: spec.pie ? { ...spec.pie, correctAngles: zeros(spec.pie.categories.length) } : null,
    bar: spec.bar ? { ...spec.bar, correctValues: zeros(spec.bar.categories.length) } : null,
    line: spec.line
      ? {
          ...spec.line,
          // Only points[].x is read by the input and the marker; the parallel y
          // mirrors the answer, so it is flattened alongside correctYValues.
          points: spec.line.points.map((point) => ({ x: point.x, y: 0 })),
          correctYValues: zeros(spec.line.points.length),
          fitShape: 'none',
          fitDescription: '',
        }
      : null,
    scatter: spec.scatter
      ? {
          ...spec.scatter,
          // givenPoints is the answer key for this chart type (markScatter compares
          // the student's points against it). The x positions are the question; the
          // y values are the answer.
          givenPoints: spec.scatter.givenPoints.map((point) => ({ x: point.x, y: 0 })),
          fitShape: 'none',
          fitDescription: '',
        }
      : null,
    histogram: spec.histogram
      ? {
          ...spec.histogram,
          bars: spec.histogram.bars.map((bar) => ({ ...bar, correctFrequencyDensity: 0 })),
        }
      : null,
    // frequencyPolygon carries no separate answer field: the correct points are
    // ((classStart+classEnd)/2, frequency), all of which is the given data the
    // student is asked to plot. Nothing to strip.
    frequencyPolygon: spec.frequencyPolygon,
    // The stem column is the scaffold the student places leaves into (StemLeafInput
    // renders one row per stem), so the stems stay and only the leaves are removed.
    stemLeaf: spec.stemLeaf
      ? { ...spec.stemLeaf, correctRows: spec.stemLeaf.correctRows.map((row) => ({ stem: row.stem, leaves: [] })) }
      : null,
    boxPlot: spec.boxPlot
      ? {
          ...spec.boxPlot,
          correctValues: { min: 0, lowerQuartile: 0, median: 0, upperQuartile: 0, max: 0 },
        }
      : null,
  };
}

// -- diagram ---------------------------------------------------------------

export function toStudentSafeDiagramSpec(spec: DiagramSpec | null, seed: string): DiagramSpec | null {
  if (!spec) return null;

  return {
    ...spec,
    // A given node renders its own label, so it keeps it. A blank node's label is
    // exactly what the student has to supply.
    nodes: spec.nodes.map((node) =>
      node.given ? node : { ...node, correctLabel: '', acceptableLabels: [] }
    ),
    // A connection the student must draw is defined entirely by its endpoints, so
    // the endpoints are the answer. The row itself stays: the UI counts missing
    // connections to know how many the student still owes.
    connections: spec.connections.map((connection) =>
      connection.given ? connection : { ...connection, from: '', to: '', label: '' }
    ),
    slots: spec.slots.map((slot) => (slot.given ? slot : { ...slot, correctOption: '' })),
    labelBank: shuffleDeterministic(spec.labelBank, seed),
  };
}
