import { evaluateAxisScale } from '@/lib/plot/scaleRules';
import type { PlotSpec, PlotSubmission } from '@/types';

export interface PlotMarkResult {
  marksAwarded: number;
  maxMarks: number;
  band: string;
  feedback: string;
  strengths: string[];
  improvements: string[];
  weaknessTags: string[];
  exemplarAnswer: string;
}

interface FeatureResult {
  label: string;
  correct: boolean;
  line: string;
}

const getBand = (marksAwarded: number, maxMarks: number) => {
  if (marksAwarded <= 0) return 'No credit yet';
  const ratio = marksAwarded / Math.max(maxMarks, 1);
  if (ratio >= 0.85) return 'Top band';
  if (ratio >= 0.65) return 'Secure';
  if (ratio >= 0.4) return 'Developing';
  return 'Limited';
};

const round = (value: number, dp = 1) => Math.round(value * 10 ** dp) / 10 ** dp;

const buildResult = (features: FeatureResult[], weaknessTag: string, exemplarAnswer: string): PlotMarkResult => {
  const marksAwarded = features.filter((f) => f.correct).length;
  const maxMarks = features.length;
  const strengths = features.filter((f) => f.correct).map((f) => f.line);
  const improvements = features.filter((f) => !f.correct).map((f) => f.line);

  return {
    marksAwarded,
    maxMarks,
    band: getBand(marksAwarded, maxMarks),
    feedback: features.map((f) => f.line).join(' '),
    strengths,
    improvements,
    weaknessTags: improvements.length > 0 ? [weaknessTag] : [],
    exemplarAnswer,
  };
};

const noAnswerResult = (maxMarks: number, exemplarAnswer: string): PlotMarkResult => ({
  marksAwarded: 0,
  maxMarks,
  band: 'No answer',
  feedback: 'No plot was submitted for this question.',
  strengths: [],
  improvements: [],
  weaknessTags: [],
  exemplarAnswer,
});

const markPie = (spec: NonNullable<PlotSpec['pie']>, submission: PlotSubmission): FeatureResult[] => {
  const submitted = submission.pieAngles;
  return spec.categories.map((category, i) => {
    const correctAngle = spec.correctAngles[i];
    const submittedAngle = Array.isArray(submitted) ? submitted[i] : undefined;
    const correct = typeof submittedAngle === 'number' && Math.abs(submittedAngle - correctAngle) <= 5;
    const line = correct
      ? `${category.label}: correct (${round(correctAngle, 0)}°).`
      : `${category.label}: you plotted ${typeof submittedAngle === 'number' ? `${round(submittedAngle, 0)}°` : 'nothing'}, correct value is ${round(correctAngle, 0)}°.`;
    return { label: category.label, correct, line };
  });
};

const markBar = (spec: NonNullable<PlotSpec['bar']>, submission: PlotSubmission): FeatureResult[] => {
  const submitted = submission.barValues;
  const tolerance = spec.yAxisStep / 2;
  const barFeatures = spec.categories.map((category, i) => {
    const correctValue = spec.correctValues[i];
    const submittedValue = Array.isArray(submitted) ? submitted[i] : undefined;
    const correct = typeof submittedValue === 'number' && Math.abs(submittedValue - correctValue) <= tolerance;
    const line = correct
      ? `${category}: correct (${round(correctValue)}).`
      : `${category}: you plotted ${typeof submittedValue === 'number' ? round(submittedValue) : 'nothing'}, correct value is ${round(correctValue)}.`;
    return { label: category, correct, line };
  });

  const scaleEval = evaluateAxisScale(submission.barAxisChoice, Math.max(...spec.correctValues), spec.correctValues);
  return [...barFeatures, { label: 'Scale choice', correct: scaleEval.correct, line: scaleEval.reason }];
};

const markLine = (spec: NonNullable<PlotSpec['line']>, submission: PlotSubmission): FeatureResult[] => {
  const submitted = submission.lineYValues;
  const tolerance = spec.yAxisStep / 2;
  const pointFeatures = spec.points.map((point, i) => {
    const correctValue = spec.correctYValues[i];
    const submittedValue = Array.isArray(submitted) ? submitted[i] : undefined;
    const correct = typeof submittedValue === 'number' && Math.abs(submittedValue - correctValue) <= tolerance;
    const label = `x=${point.x}`;
    const line = correct
      ? `${label}: correct (y=${round(correctValue)}).`
      : `${label}: you plotted y=${typeof submittedValue === 'number' ? round(submittedValue) : 'nothing'}, correct value is y=${round(correctValue)}.`;
    return { label, correct, line };
  });

  const yScaleEval = evaluateAxisScale(submission.lineYAxisChoice, Math.max(...spec.correctYValues), spec.correctYValues);
  const yScaleFeature: FeatureResult = { label: 'Y-scale choice', correct: yScaleEval.correct, line: yScaleEval.reason };

  const xValues = spec.points.map((point) => point.x);
  const xScaleEval = evaluateAxisScale(submission.lineXAxisChoice, Math.max(...xValues), xValues);
  const xScaleFeature: FeatureResult = { label: 'X-scale choice', correct: xScaleEval.correct, line: xScaleEval.reason };

  if (!spec.requiresBestFit) return [...pointFeatures, yScaleFeature, xScaleFeature];

  const fitCorrect = submission.lineFitShape === spec.fitShape;
  const fitFeature: FeatureResult = {
    label: 'Fit shape',
    correct: fitCorrect,
    line: fitCorrect
      ? `Correct choice of ${spec.fitShape === 'none' ? 'no fit line' : `a ${spec.fitShape}`} of best fit. ${spec.fitDescription}`.trim()
      : `Fit shape should be ${spec.fitShape === 'none' ? 'no fit line/curve' : `a ${spec.fitShape}`}, not what you chose. ${spec.fitDescription}`.trim(),
  };

  return [...pointFeatures, yScaleFeature, xScaleFeature, fitFeature];
};

const markScatter = (spec: NonNullable<PlotSpec['scatter']>, submission: PlotSubmission): FeatureResult[] => {
  const submittedPoints = Array.isArray(submission.scatterPoints) ? [...submission.scatterPoints] : [];
  const diagonal = Math.sqrt(spec.xAxisMax ** 2 + spec.yAxisMax ** 2);
  const pointTolerance = diagonal * 0.03;

  const pointFeatures: FeatureResult[] = spec.givenPoints.map((given, i) => {
    let bestIndex = -1;
    let bestDistance = Infinity;
    submittedPoints.forEach((candidate, idx) => {
      const dx = (candidate.x - given.x) / (spec.xAxisMax || 1);
      const dy = (candidate.y - given.y) / (spec.yAxisMax || 1);
      const normalizedDistance = Math.sqrt(dx ** 2 + dy ** 2) * diagonal;
      if (normalizedDistance < bestDistance) {
        bestDistance = normalizedDistance;
        bestIndex = idx;
      }
    });
    const correct = bestIndex >= 0 && bestDistance <= pointTolerance;
    if (correct) submittedPoints.splice(bestIndex, 1);
    const label = `Point ${i + 1} (${given.x}, ${given.y})`;
    return { label, correct, line: correct ? `${label}: plotted correctly.` : `${label}: not accurately plotted.` };
  });

  const fitCorrect = submission.scatterFitShape === spec.fitShape;
  const fitFeature: FeatureResult = {
    label: 'Fit shape',
    correct: fitCorrect,
    line: fitCorrect
      ? `Correct choice of ${spec.fitShape === 'none' ? 'no fit line' : `a ${spec.fitShape}`} of best fit. ${spec.fitDescription}`.trim()
      : `Fit shape should be ${spec.fitShape === 'none' ? 'no fit line/curve' : `a ${spec.fitShape}`}, not what you chose. ${spec.fitDescription}`.trim(),
  };

  return [...pointFeatures, fitFeature];
};

const markHistogram = (spec: NonNullable<PlotSpec['histogram']>, submission: PlotSubmission): FeatureResult[] => {
  const submitted = submission.histogramHeights;
  return spec.bars.map((bar, i) => {
    const correctValue = bar.correctFrequencyDensity;
    const submittedValue = Array.isArray(submitted) ? submitted[i] : undefined;
    const tolerance = Math.max(0.05, correctValue * 0.05);
    const correct = typeof submittedValue === 'number' && Math.abs(submittedValue - correctValue) <= tolerance;
    const label = `Class ${bar.classStart}-${bar.classEnd}`;
    const line = correct
      ? `${label}: correct frequency density (${round(correctValue, 2)}).`
      : `${label}: you plotted frequency density ${typeof submittedValue === 'number' ? round(submittedValue, 2) : 'nothing'}, correct value is ${round(correctValue, 2)}.`;
    return { label, correct, line };
  });
};

const markFrequencyPolygon = (spec: NonNullable<PlotSpec['frequencyPolygon']>, submission: PlotSubmission): FeatureResult[] => {
  const submitted = submission.frequencyPolygonPoints;
  const maxFrequency = Math.max(...spec.frequency, 1);
  return spec.classStart.map((start, i) => {
    const end = spec.classEnd[i];
    const midpoint = (start + end) / 2;
    const correctFrequency = spec.frequency[i];
    const submittedPoint = Array.isArray(submitted) ? submitted[i] : undefined;
    const xTolerance = (end - start) / 2;
    const yTolerance = maxFrequency * 0.1;
    const correct =
      !!submittedPoint &&
      Math.abs(submittedPoint.x - midpoint) <= xTolerance &&
      Math.abs(submittedPoint.y - correctFrequency) <= yTolerance;
    const label = `Class ${start}-${end}`;
    const line = correct
      ? `${label}: correct (midpoint ${round(midpoint)}, frequency ${correctFrequency}).`
      : `${label}: point should be at (${round(midpoint)}, ${correctFrequency}).`;
    return { label, correct, line };
  });
};

const markStemLeaf = (spec: NonNullable<PlotSpec['stemLeaf']>, submission: PlotSubmission): FeatureResult[] => {
  const submittedRows = Array.isArray(submission.stemLeafRows) ? submission.stemLeafRows : [];
  const submittedByStem = new Map(submittedRows.map((row) => [row.stem, [...row.leaves].sort((a, b) => a - b)]));

  const rowFeatures: FeatureResult[] = spec.correctRows.map((row) => {
    const submittedLeaves = submittedByStem.get(row.stem);
    const correctLeaves = [...row.leaves].sort((a, b) => a - b);
    const correct =
      !!submittedLeaves &&
      submittedLeaves.length === correctLeaves.length &&
      submittedLeaves.every((leaf, i) => leaf === correctLeaves[i]);
    const label = `Stem ${row.stem}`;
    const line = correct
      ? `${label}: correct leaves (${correctLeaves.join(', ')}).`
      : `${label}: leaves should be (${correctLeaves.join(', ')}).`;
    return { label, correct, line };
  });

  const allAscending = submittedRows.every((row) => row.leaves.every((leaf, i) => i === 0 || leaf >= row.leaves[i - 1]));
  const ascendingFeature: FeatureResult = {
    label: 'Ascending order',
    correct: allAscending,
    line: allAscending ? 'Leaves correctly ordered ascending within each stem.' : 'Leaves within each stem should be ordered ascending.',
  };

  return [...rowFeatures, ascendingFeature];
};

const markBoxPlot = (spec: NonNullable<PlotSpec['boxPlot']>, submission: PlotSubmission): FeatureResult[] => {
  const tolerance = (spec.axisMax - spec.axisMin) * 0.02;
  const submitted = submission.boxPlotValues;
  const fields: { key: keyof NonNullable<PlotSubmission['boxPlotValues']>; label: string }[] = [
    { key: 'min', label: 'Minimum' },
    { key: 'lowerQuartile', label: 'Lower quartile' },
    { key: 'median', label: 'Median' },
    { key: 'upperQuartile', label: 'Upper quartile' },
    { key: 'max', label: 'Maximum' },
  ];

  return fields.map(({ key, label }) => {
    const correctValue = spec.correctValues[key];
    const submittedValue = submitted?.[key];
    const correct = typeof submittedValue === 'number' && Math.abs(submittedValue - correctValue) <= tolerance;
    const line = correct
      ? `${label}: correct (${round(correctValue)}).`
      : `${label}: you plotted ${typeof submittedValue === 'number' ? round(submittedValue) : 'nothing'}, correct value is ${round(correctValue)}.`;
    return { label, correct, line };
  });
};

const WEAKNESS_TAGS: Record<PlotSpec['chartType'], string> = {
  pie: 'Pie chart angle accuracy',
  bar: 'Bar chart plotting accuracy and scale choice',
  line: 'Line graph plotting accuracy, scale choice and best-fit judgement',
  scatter: 'Choosing line vs curve of best fit',
  histogram: 'Frequency density calculation',
  frequencyPolygon: 'Frequency polygon plotting accuracy',
  stemLeaf: 'Stem-and-leaf ordering',
  boxPlot: 'Box plot five-number summary accuracy',
};

const buildExemplarAnswer = (spec: PlotSpec): string => {
  switch (spec.chartType) {
    case 'pie':
      return spec.pie!.categories.map((c, i) => `${c.label}: ${round(spec.pie!.correctAngles[i], 0)}°`).join(', ');
    case 'bar':
      return spec.bar!.categories.map((c, i) => `${c}: ${round(spec.bar!.correctValues[i])}`).join(', ');
    case 'line': {
      const points = spec.line!.points.map((p, i) => `x=${p.x}: y=${round(spec.line!.correctYValues[i])}`).join(', ');
      return spec.line!.requiresBestFit ? `${points}. Fit: ${spec.line!.fitShape}. ${spec.line!.fitDescription}` : points;
    }
    case 'scatter':
      return `Fit: ${spec.scatter!.fitShape}. ${spec.scatter!.fitDescription}`;
    case 'histogram':
      return spec.histogram!.bars.map((b) => `${b.classStart}-${b.classEnd}: density ${round(b.correctFrequencyDensity, 2)}`).join(', ');
    case 'frequencyPolygon':
      return spec.frequencyPolygon!.classStart
        .map((start, i) => `midpoint ${round((start + spec.frequencyPolygon!.classEnd[i]) / 2)}: ${spec.frequencyPolygon!.frequency[i]}`)
        .join(', ');
    case 'stemLeaf':
      return `${spec.stemLeaf!.key}. ${spec.stemLeaf!.correctRows.map((r) => `${r.stem} | ${r.leaves.join(' ')}`).join('; ')}`;
    case 'boxPlot': {
      const v = spec.boxPlot!.correctValues;
      return `Min ${v.min}, LQ ${v.lowerQuartile}, Median ${v.median}, UQ ${v.upperQuartile}, Max ${v.max}`;
    }
    default:
      return '';
  }
};

/** Deterministically marks a plot-question submission against its PlotSpec. Never
 * delegates to the AI — geometric/structural comparison is exact math, unlike
 * open-ended text marking. Mirrors the MCQ path's "server marks, AI is not trusted"
 * posture in mark-answers/route.ts. */
export const markPlotAnswer = (plotSpec: PlotSpec, submissionRaw: unknown, maxMarks: number): PlotMarkResult => {
  const exemplarAnswer = buildExemplarAnswer(plotSpec);
  if (!submissionRaw || typeof submissionRaw !== 'object') return noAnswerResult(maxMarks, exemplarAnswer);

  const submission = submissionRaw as PlotSubmission;
  const weaknessTag = WEAKNESS_TAGS[plotSpec.chartType];

  let features: FeatureResult[];
  switch (plotSpec.chartType) {
    case 'pie':
      features = markPie(plotSpec.pie!, submission);
      break;
    case 'bar':
      features = markBar(plotSpec.bar!, submission);
      break;
    case 'line':
      features = markLine(plotSpec.line!, submission);
      break;
    case 'scatter':
      features = markScatter(plotSpec.scatter!, submission);
      break;
    case 'histogram':
      features = markHistogram(plotSpec.histogram!, submission);
      break;
    case 'frequencyPolygon':
      features = markFrequencyPolygon(plotSpec.frequencyPolygon!, submission);
      break;
    case 'stemLeaf':
      features = markStemLeaf(plotSpec.stemLeaf!, submission);
      break;
    case 'boxPlot':
      features = markBoxPlot(plotSpec.boxPlot!, submission);
      break;
    default:
      return noAnswerResult(maxMarks, exemplarAnswer);
  }

  const result = buildResult(features, weaknessTag, exemplarAnswer);
  // Scale to the question's actual mark value if it differs from the raw feature count
  // (marks is set by the AI prompt to match feature count, but defend against drift).
  if (result.maxMarks !== maxMarks && result.maxMarks > 0) {
    const scaled = Math.round((result.marksAwarded / result.maxMarks) * maxMarks);
    return { ...result, marksAwarded: scaled, maxMarks };
  }

  return result;
};
