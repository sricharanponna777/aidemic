'use client';

import type { PlotSpec, PlotSubmission } from '@/types';
import { BarChartInput } from './BarChartInput';
import { BoxPlotInput } from './BoxPlotInput';
import { FrequencyPolygonInput } from './FrequencyPolygonInput';
import { HistogramInput } from './HistogramInput';
import { LineGraphInput, type LineGraphValue } from './LineGraphInput';
import { PieChartInput } from './PieChartInput';
import { ScatterFitInput, type ScatterValue } from './ScatterFitInput';
import { StemLeafInput } from './StemLeafInput';

interface PlotAnswerInputProps {
  plotSpec: PlotSpec;
  value: string;
  onChange: (serialized: string) => void;
  mode: 'answer' | 'review';
  studentSubmission?: PlotSubmission | null;
}

const parseSubmission = (value: string): PlotSubmission | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as PlotSubmission;
  } catch {
    return null;
  }
};

/** Renders the interactive chart matching plotSpec.chartType and serializes the student's
 * plotted answer to JSON via onChange — fits the existing updateAnswer(index, value: string)
 * contract used by every other question type on the AI Questions page. */
export function PlotAnswerInput({ plotSpec, value, onChange, mode, studentSubmission }: PlotAnswerInputProps) {
  const submission = mode === 'review' ? studentSubmission ?? null : parseSubmission(value);
  const readOnly = mode === 'review';

  if (plotSpec.chartType === 'boxPlot' && plotSpec.boxPlot) {
    const boxPlotValue = submission?.boxPlotValues ?? null;
    return (
      <BoxPlotInput
        spec={plotSpec.boxPlot}
        value={boxPlotValue}
        readOnly={readOnly}
        correctValues={readOnly ? plotSpec.boxPlot.correctValues : undefined}
        onChange={(next) => onChange(JSON.stringify({ chartType: 'boxPlot', boxPlotValues: next } satisfies PlotSubmission))}
      />
    );
  }

  if (plotSpec.chartType === 'pie' && plotSpec.pie) {
    const pieValue = submission?.pieAngles ?? null;
    return (
      <PieChartInput
        spec={plotSpec.pie}
        value={pieValue}
        readOnly={readOnly}
        correctValues={readOnly ? plotSpec.pie.correctAngles : undefined}
        onChange={(next) => onChange(JSON.stringify({ chartType: 'pie', pieAngles: next } satisfies PlotSubmission))}
      />
    );
  }

  if (plotSpec.chartType === 'bar' && plotSpec.bar) {
    const barValue = submission?.barValues ?? null;
    return (
      <BarChartInput
        spec={plotSpec.bar}
        value={barValue}
        axisChoice={submission?.barAxisChoice ?? null}
        readOnly={readOnly}
        correctValues={readOnly ? plotSpec.bar.correctValues : undefined}
        onChange={(next, axisChoice) =>
          onChange(JSON.stringify({ chartType: 'bar', barValues: next, barAxisChoice: axisChoice } satisfies PlotSubmission))
        }
      />
    );
  }

  if (plotSpec.chartType === 'histogram' && plotSpec.histogram) {
    const histogramValue = submission?.histogramHeights ?? null;
    return (
      <HistogramInput
        spec={plotSpec.histogram}
        value={histogramValue}
        readOnly={readOnly}
        correctValues={readOnly ? plotSpec.histogram.bars.map((bar) => bar.correctFrequencyDensity) : undefined}
        onChange={(next) => onChange(JSON.stringify({ chartType: 'histogram', histogramHeights: next } satisfies PlotSubmission))}
      />
    );
  }

  if (plotSpec.chartType === 'frequencyPolygon' && plotSpec.frequencyPolygon) {
    const spec = plotSpec.frequencyPolygon;
    const midpoints = spec.classStart.map((start, i) => (start + spec.classEnd[i]) / 2);
    const polygonValue = submission?.frequencyPolygonPoints?.map((p) => p.y) ?? null;
    return (
      <FrequencyPolygonInput
        spec={spec}
        value={polygonValue}
        readOnly={readOnly}
        correctValues={readOnly ? spec.frequency : undefined}
        onChange={(next) =>
          onChange(
            JSON.stringify({
              chartType: 'frequencyPolygon',
              frequencyPolygonPoints: midpoints.map((x, i) => ({ x, y: next[i] })),
            } satisfies PlotSubmission)
          )
        }
      />
    );
  }

  if (plotSpec.chartType === 'line' && plotSpec.line) {
    const lineValue: LineGraphValue | null = submission?.lineYValues
      ? { yValues: submission.lineYValues, fitShape: submission.lineFitShape ?? 'none' }
      : null;
    return (
      <LineGraphInput
        spec={plotSpec.line}
        value={lineValue}
        yAxisChoice={submission?.lineYAxisChoice ?? null}
        xAxisChoice={submission?.lineXAxisChoice ?? null}
        readOnly={readOnly}
        correctValue={readOnly ? { yValues: plotSpec.line.correctYValues, fitShape: plotSpec.line.fitShape } : undefined}
        onChange={(next, yAxisChoice, xAxisChoice) =>
          onChange(
            JSON.stringify({
              chartType: 'line',
              lineYValues: next.yValues,
              lineFitShape: next.fitShape,
              lineYAxisChoice: yAxisChoice,
              lineXAxisChoice: xAxisChoice,
            } satisfies PlotSubmission)
          )
        }
      />
    );
  }

  if (plotSpec.chartType === 'scatter' && plotSpec.scatter) {
    const scatterValue: ScatterValue | null = submission?.scatterPoints
      ? { points: submission.scatterPoints, fitShape: submission.scatterFitShape ?? 'none' }
      : null;
    return (
      <ScatterFitInput
        spec={plotSpec.scatter}
        value={scatterValue}
        readOnly={readOnly}
        correctValue={readOnly ? { points: plotSpec.scatter.givenPoints, fitShape: plotSpec.scatter.fitShape } : undefined}
        onChange={(next) =>
          onChange(
            JSON.stringify({ chartType: 'scatter', scatterPoints: next.points, scatterFitShape: next.fitShape } satisfies PlotSubmission)
          )
        }
      />
    );
  }

  if (plotSpec.chartType === 'stemLeaf' && plotSpec.stemLeaf) {
    const stemLeafValue = submission?.stemLeafRows ?? null;
    return (
      <StemLeafInput
        spec={plotSpec.stemLeaf}
        value={stemLeafValue}
        readOnly={readOnly}
        correctValues={readOnly ? plotSpec.stemLeaf.correctRows : undefined}
        onChange={(next) => onChange(JSON.stringify({ chartType: 'stemLeaf', stemLeafRows: next } satisfies PlotSubmission))}
      />
    );
  }

  return (
    <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
      This chart type isn&apos;t supported for interactive plotting yet.
    </p>
  );
}
