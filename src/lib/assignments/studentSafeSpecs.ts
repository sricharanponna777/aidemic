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
 * ALLOW-LIST, NOT A DELETE-LIST. Every field is named explicitly and nothing is
 * spread, so an answer-bearing field added to the generator later is excluded by
 * default rather than leaking until someone remembers to strip it. This is the same
 * rule src/lib/papers/studentSafePaper.ts states and follows; building these out of
 * `{ ...spec.stemLeaf }` is how PlotStemLeafData.rawValues (the complete dataset,
 * of which correctRows is just a sorted restatement) and
 * PlotBoxPlotData.rawDataOrDescription (the dataset the zeroed five-number summary
 * describes) reached in-progress attempts with their "answers" blanked and the
 * source data intact.
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
    pie: spec.pie
      ? {
          categories: spec.pie.categories.map((category) => ({ label: category.label, value: category.value })),
          correctAngles: zeros(spec.pie.categories.length),
        }
      : null,
    bar: spec.bar
      ? {
          categories: [...spec.bar.categories],
          correctValues: zeros(spec.bar.categories.length),
          yAxisLabel: spec.bar.yAxisLabel,
          // The axis is the question, not the answer: normalizeBar computes these from
          // the correct values at generation time, so keeping them lets the input draw
          // an identical axis without reading what it is meant to hide.
          yAxisMax: spec.bar.yAxisMax,
          yAxisStep: spec.bar.yAxisStep,
        }
      : null,
    line: spec.line
      ? {
          xLabel: spec.line.xLabel,
          yLabel: spec.line.yLabel,
          // Only points[].x is read by the input and the marker; the parallel y
          // mirrors the answer, so it is flattened alongside correctYValues.
          points: spec.line.points.map((point) => ({ x: point.x, y: 0 })),
          correctYValues: zeros(spec.line.points.length),
          yAxisMax: spec.line.yAxisMax,
          yAxisStep: spec.line.yAxisStep,
          requiresBestFit: spec.line.requiresBestFit,
          fitShape: 'none',
          fitDescription: '',
        }
      : null,
    scatter: spec.scatter
      ? {
          xLabel: spec.scatter.xLabel,
          yLabel: spec.scatter.yLabel,
          // givenPoints is the answer key for this chart type (markScatter compares
          // the student's points against it). The x positions are the question; the
          // y values are the answer.
          givenPoints: spec.scatter.givenPoints.map((point) => ({ x: point.x, y: 0 })),
          fitShape: 'none',
          fitDescription: '',
          connectPoints: spec.scatter.connectPoints,
          xAxisMax: spec.scatter.xAxisMax,
          yAxisMax: spec.scatter.yAxisMax,
          // Kept for the same reason as bar's axis fields, and load-bearing here: the
          // y coordinates above are blanked, so without the stored step drag-snapping
          // could not reach the answer at all.
          xAxisStep: spec.scatter.xAxisStep,
          yAxisStep: spec.scatter.yAxisStep,
        }
      : null,
    histogram: spec.histogram
      ? {
          bars: spec.histogram.bars.map((bar) => ({
            classStart: bar.classStart,
            classEnd: bar.classEnd,
            frequency: bar.frequency,
            correctFrequencyDensity: 0,
          })),
          xLabel: spec.histogram.xLabel,
          yLabel: spec.histogram.yLabel,
        }
      : null,
    // frequencyPolygon carries no separate answer field: the correct points are
    // ((classStart+classEnd)/2, frequency), all of which is the given data the
    // student is asked to plot. Enumerated anyway, so a field added here later is
    // not shipped just because today's fields happen to be safe.
    frequencyPolygon: spec.frequencyPolygon
      ? {
          classStart: [...spec.frequencyPolygon.classStart],
          classEnd: [...spec.frequencyPolygon.classEnd],
          frequency: [...spec.frequencyPolygon.frequency],
          xLabel: spec.frequencyPolygon.xLabel,
          yLabel: spec.frequencyPolygon.yLabel,
        }
      : null,
    stemLeaf: spec.stemLeaf
      ? {
          stemUnit: spec.stemLeaf.stemUnit,
          leafUnit: spec.stemLeaf.leafUnit,
          // rawValues is the complete dataset and correctRows is defined as those
          // values sorted and split by stem, so shipping it while emptying the leaves
          // hides nothing -- a sort reconstructs the answer exactly. Nothing reads it
          // client-side; the generator (ai/plotSpec.ts) is its only other consumer.
          rawValues: [],
          // The stem column is the scaffold the student places leaves into (StemLeafInput
          // renders one row per stem), so the stems stay and only the leaves are removed.
          correctRows: spec.stemLeaf.correctRows.map((row) => ({ stem: row.stem, leaves: [] })),
          key: spec.stemLeaf.key,
        }
      : null,
    boxPlot: spec.boxPlot
      ? {
          axisLabel: spec.boxPlot.axisLabel,
          axisMin: spec.boxPlot.axisMin,
          axisMax: spec.boxPlot.axisMax,
          correctValues: { min: 0, lowerQuartile: 0, median: 0, upperQuartile: 0, max: 0 },
          // The zeroed values above are exactly the five-number summary of this string,
          // so sending it undoes the blanking. Nothing reads it client-side.
          rawDataOrDescription: '',
        }
      : null,
  };
}

// -- diagram ---------------------------------------------------------------

export function toStudentSafeDiagramSpec(spec: DiagramSpec | null, seed: string): DiagramSpec | null {
  if (!spec) return null;

  return {
    kind: spec.kind,
    title: spec.title,
    primitives: spec.primitives,
    // A given node renders its own label, so it keeps it. A blank node's label is
    // exactly what the student has to supply.
    nodes: spec.nodes.map((node) =>
      node.given
        ? node
        : {
            id: node.id,
            x: node.x,
            y: node.y,
            correctLabel: '',
            acceptableLabels: [],
            given: node.given,
            role: node.role,
          }
    ),
    // A connection the student must draw is defined entirely by its endpoints, so
    // the endpoints are the answer. The row itself stays: the UI counts missing
    // connections to know how many the student still owes.
    connections: spec.connections.map((connection) =>
      connection.given
        ? connection
        : {
            from: '',
            to: '',
            directed: connection.directed,
            label: '',
            given: connection.given,
            style: connection.style,
          }
    ),
    slots: spec.slots.map((slot) =>
      slot.given
        ? slot
        : {
            id: slot.id,
            x: slot.x,
            y: slot.y,
            paletteId: slot.paletteId,
            correctOption: '',
            given: slot.given,
            // Marking-feedback prose describing what belongs in this slot ("a lone pair
            // on the oxygen"), which names the answer for a blank one.
            description: '',
            group: slot.group,
          }
    ),
    labelBank: shuffleDeterministic(spec.labelBank, seed),
  };
}
