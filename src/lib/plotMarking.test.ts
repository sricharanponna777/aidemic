import { describe, expect, it } from 'vitest';
import { markPlotAnswer } from './plotMarking';
import type { PlotSpec } from '@/types';

const emptySpec: PlotSpec = {
  chartType: 'bar',
  pie: null,
  bar: null,
  line: null,
  scatter: null,
  histogram: null,
  frequencyPolygon: null,
  stemLeaf: null,
  boxPlot: null,
};

/**
 * A spec stored before yAxisStep existed makes `spec.yAxisStep / 2` NaN, and
 * `Math.abs(...) <= NaN` is false for every value -- so a perfectly plotted graph
 * marked zero, with nothing logged and no exception to notice. The types say the
 * field is required, which is why nothing caught it; the data predates the type.
 */
describe('marking a plot whose spec has no axis step recorded', () => {
  it('awards marks for correct bars instead of failing every one', () => {
    const spec: PlotSpec = {
      ...emptySpec,
      chartType: 'bar',
      bar: {
        categories: ['A', 'B'],
        correctValues: [10, 20],
        yAxisLabel: 'n',
        yAxisMax: 25,
        // The bug: absent at rest, required by the type.
        yAxisStep: undefined as unknown as number,
      },
    };

    const result = markPlotAnswer(spec, { chartType: 'bar', barValues: [10, 20] }, 4);
    expect(result.marksAwarded).toBeGreaterThan(0);
  });

  it('awards marks for correct line points instead of failing every one', () => {
    const spec: PlotSpec = {
      ...emptySpec,
      chartType: 'line',
      line: {
        xLabel: 't',
        yLabel: 'v',
        points: [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
        correctYValues: [10, 20],
        yAxisMax: 25,
        yAxisStep: undefined as unknown as number,
        requiresBestFit: false,
        fitShape: 'none',
        fitDescription: '',
      },
    };

    const result = markPlotAnswer(spec, { chartType: 'line', lineYValues: [10, 20] }, 4);
    expect(result.marksAwarded).toBeGreaterThan(0);
  });

  it('still marks a genuinely wrong bar wrong', () => {
    const spec: PlotSpec = {
      ...emptySpec,
      chartType: 'bar',
      bar: {
        categories: ['A'],
        correctValues: [10],
        yAxisLabel: 'n',
        yAxisMax: 25,
        yAxisStep: undefined as unknown as number,
      },
    };

    const perfect = markPlotAnswer(spec, { chartType: 'bar', barValues: [10] }, 2);
    const wrong = markPlotAnswer(spec, { chartType: 'bar', barValues: [999] }, 2);
    expect(wrong.marksAwarded).toBeLessThan(perfect.marksAwarded);
  });

  it('uses the recorded step when there is one', () => {
    const spec: PlotSpec = {
      ...emptySpec,
      chartType: 'bar',
      bar: { categories: ['A'], correctValues: [10], yAxisLabel: 'n', yAxisMax: 25, yAxisStep: 5 },
    };
    // Half a step of 5 is 2.5, so 12 is inside tolerance and 13 is not.
    expect(markPlotAnswer(spec, { chartType: 'bar', barValues: [12] }, 2).marksAwarded).toBeGreaterThan(
      markPlotAnswer(spec, { chartType: 'bar', barValues: [13] }, 2).marksAwarded
    );
  });
});

/**
 * Scatter and box plot derive their tolerance from the axis rather than the step,
 * but the failure is identical: an absent axis field makes the tolerance NaN and
 * every comparison against it false. markScatter was already guarding the two
 * divisors with `|| 1` while leaving the diagonal those ratios get multiplied by
 * unguarded, so the guard defended everything except the number that mattered.
 */
describe('marking a plot whose spec has no axis range recorded', () => {
  const scatterSpec = (xAxisMax: number | undefined, yAxisMax: number | undefined): PlotSpec => ({
    ...emptySpec,
    chartType: 'scatter',
    scatter: {
      xLabel: 'x',
      yLabel: 'y',
      givenPoints: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
      fitShape: 'none',
      fitDescription: '',
      connectPoints: false,
      xAxisMax: xAxisMax as unknown as number,
      yAxisMax: yAxisMax as unknown as number,
    },
  });

  // Full marks, not just > 0: two given points plus the fit shape is three
  // features, and the fit mark alone is awarded even when every point is marked
  // wrong -- so `> 0` passed against the unguarded code and pinned nothing.
  it('awards full marks for correctly plotted points instead of failing every one', () => {
    const result = markPlotAnswer(
      scatterSpec(undefined, undefined),
      {
        chartType: 'scatter',
        scatterPoints: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
        ],
        scatterFitShape: 'none',
      },
      3
    );
    expect(result.marksAwarded).toBe(3);
  });

  it('still marks a genuinely misplaced scatter point wrong', () => {
    const spec = scatterSpec(undefined, undefined);
    const perfect = markPlotAnswer(
      spec,
      { chartType: 'scatter', scatterPoints: [{ x: 10, y: 20 }, { x: 30, y: 40 }], scatterFitShape: 'none' },
      3
    );
    const wrong = markPlotAnswer(
      spec,
      { chartType: 'scatter', scatterPoints: [{ x: 999, y: 999 }, { x: 998, y: 998 }], scatterFitShape: 'none' },
      3
    );
    expect(wrong.marksAwarded).toBeLessThan(perfect.marksAwarded);
  });

  it('uses the recorded axis when there is one', () => {
    const spec = scatterSpec(100, 100);
    // 3% of a diagonal of ~141 is ~4.2, so a point 2 away is in and 40 away is out.
    const near = markPlotAnswer(
      spec,
      { chartType: 'scatter', scatterPoints: [{ x: 12, y: 20 }, { x: 30, y: 40 }], scatterFitShape: 'none' },
      3
    );
    const far = markPlotAnswer(
      spec,
      { chartType: 'scatter', scatterPoints: [{ x: 50, y: 20 }, { x: 30, y: 40 }], scatterFitShape: 'none' },
      3
    );
    expect(far.marksAwarded).toBeLessThan(near.marksAwarded);
  });

  it('awards full marks for a correct box plot with no axis range', () => {
    const spec: PlotSpec = {
      ...emptySpec,
      chartType: 'boxPlot',
      boxPlot: {
        axisLabel: 'score',
        axisMin: undefined as unknown as number,
        axisMax: undefined as unknown as number,
        correctValues: { min: 10, lowerQuartile: 20, median: 30, upperQuartile: 40, max: 50 },
        rawDataOrDescription: '',
      },
    };

    const result = markPlotAnswer(
      spec,
      {
        chartType: 'boxPlot',
        boxPlotValues: { min: 10, lowerQuartile: 20, median: 30, upperQuartile: 40, max: 50 },
      },
      5
    );
    expect(result.marksAwarded).toBe(5);
  });
});
