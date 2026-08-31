import { describe, expect, it } from 'vitest';
import { toStudentSafeDiagramSpec, toStudentSafePlotSpec } from './studentSafeSpecs';
import type { DiagramSpec, PlotSpec } from '@/types';

const emptyPlot: PlotSpec = {
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

describe('toStudentSafePlotSpec', () => {
  it('zeroes bar values but keeps the categories and axis', () => {
    const safe = toStudentSafePlotSpec({
      ...emptyPlot,
      bar: { categories: ['A', 'B'], correctValues: [12, 30], yAxisLabel: 'Count', yAxisMax: 30, yAxisStep: 5 },
    });
    expect(safe!.bar).toEqual({
      categories: ['A', 'B'],
      correctValues: [0, 0],
      yAxisLabel: 'Count',
      yAxisMax: 30,
      yAxisStep: 5,
    });
  });

  it('keeps line x positions but drops the y answers and the expected fit', () => {
    const safe = toStudentSafePlotSpec({
      ...emptyPlot,
      chartType: 'line',
      line: {
        xLabel: 't',
        yLabel: 'v',
        points: [
          { x: 1, y: 4 },
          { x: 2, y: 9 },
        ],
        correctYValues: [4, 9],
        yAxisMax: 10,
        yAxisStep: 2,
        requiresBestFit: true,
        fitShape: 'curve',
        fitDescription: 'A rising curve.',
      },
    });
    expect(safe!.line!.points).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(safe!.line!.correctYValues).toEqual([0, 0]);
    expect(safe!.line!.fitShape).toBe('none');
    expect(safe!.line!.fitDescription).toBe('');
    // requiresBestFit is the question ("do you need a line of best fit?"), not the answer.
    expect(safe!.line!.requiresBestFit).toBe(true);
  });

  it('blanks the scatter y coordinates, which are that chart type answer key', () => {
    const safe = toStudentSafePlotSpec({
      ...emptyPlot,
      chartType: 'scatter',
      scatter: {
        xLabel: 'x',
        yLabel: 'y',
        givenPoints: [
          { x: 1, y: 20 },
          { x: 2, y: 45 },
        ],
        fitShape: 'line',
        fitDescription: 'Positive correlation.',
        connectPoints: false,
        xAxisMax: 2,
        yAxisMax: 50,
        xAxisStep: 0.5,
        yAxisStep: 10,
      },
    });
    expect(safe!.scatter!.givenPoints).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(safe!.scatter!.fitShape).toBe('none');
    // The axis, which the input needs in order to render and snap, survives.
    expect(safe!.scatter!.yAxisMax).toBe(50);
    expect(safe!.scatter!.yAxisStep).toBe(10);
  });

  it('keeps stem-and-leaf stems as scaffolding but removes the leaves', () => {
    const safe = toStudentSafePlotSpec({
      ...emptyPlot,
      chartType: 'stemLeaf',
      stemLeaf: {
        stemUnit: 10,
        leafUnit: 1,
        rawValues: [52, 55, 61],
        correctRows: [
          { stem: 5, leaves: [2, 5] },
          { stem: 6, leaves: [1] },
        ],
        key: '5 | 2 means 52',
      },
    });
    expect(safe!.stemLeaf!.correctRows).toEqual([
      { stem: 5, leaves: [] },
      { stem: 6, leaves: [] },
    ]);
  });

  it('zeroes histogram densities and box-plot quartiles', () => {
    const safe = toStudentSafePlotSpec({
      ...emptyPlot,
      chartType: 'histogram',
      histogram: {
        bars: [{ classStart: 0, classEnd: 10, frequency: 20, correctFrequencyDensity: 2 }],
        xLabel: 'x',
        yLabel: 'density',
      },
      boxPlot: {
        axisLabel: 'mass',
        axisMin: 0,
        axisMax: 100,
        correctValues: { min: 10, lowerQuartile: 25, median: 40, upperQuartile: 60, max: 90 },
        rawDataOrDescription: '10, 25, 40, 60, 90',
      },
    });
    // The given class widths and frequencies stay: the density is recomputed from them.
    expect(safe!.histogram!.bars[0]).toEqual({
      classStart: 0,
      classEnd: 10,
      frequency: 20,
      correctFrequencyDensity: 0,
    });
    expect(safe!.boxPlot!.correctValues).toEqual({
      min: 0,
      lowerQuartile: 0,
      median: 0,
      upperQuartile: 0,
      max: 0,
    });
  });

  it('returns null for a question with no plot', () => {
    expect(toStudentSafePlotSpec(null)).toBeNull();
  });
});

const diagram: DiagramSpec = {
  kind: 'structural',
  title: 'The carbon cycle',
  primitives: [],
  nodes: [
    { id: 'n1', x: 10, y: 10, correctLabel: 'Photosynthesis', acceptableLabels: ['photosynthesis'], given: true, role: 'label' },
    { id: 'n2', x: 50, y: 10, correctLabel: 'Respiration', acceptableLabels: ['aerobic respiration'], given: false, role: 'label' },
    { id: 'n3', x: 90, y: 10, correctLabel: 'Combustion', acceptableLabels: [], given: false, role: 'label' },
  ],
  connections: [
    { from: 'n1', to: 'n2', directed: true, label: 'carbon', given: true, style: 'solid' },
    { from: 'n2', to: 'n3', directed: true, label: 'carbon', given: false, style: 'dashed' },
  ],
  slots: [
    { id: 's1', x: 20, y: 40, paletteId: 'charge', correctOption: 'plus', given: true, description: '', group: '' },
    { id: 's2', x: 40, y: 40, paletteId: 'charge', correctOption: 'minus', given: false, description: 'ion charge', group: '' },
  ],
  labelBank: ['Respiration', 'Combustion', 'Diffusion', 'Evaporation'],
};

describe('toStudentSafeDiagramSpec', () => {
  it('strips the labels of blank nodes and keeps the labels of given ones', () => {
    const safe = toStudentSafeDiagramSpec(diagram, 'seed')!;
    expect(safe.nodes[0]).toEqual(diagram.nodes[0]);
    expect(safe.nodes[1]!.correctLabel).toBe('');
    expect(safe.nodes[1]!.acceptableLabels).toEqual([]);
    // Geometry, which the diagram has to be drawn from, is untouched.
    expect(safe.nodes[1]!.x).toBe(50);
    expect(safe.nodes[1]!.given).toBe(false);
  });

  it('blanks the endpoints of connections the student must draw, keeping the row', () => {
    const safe = toStudentSafeDiagramSpec(diagram, 'seed')!;
    expect(safe.connections[0]).toEqual(diagram.connections[0]);
    expect(safe.connections[1]).toEqual({
      from: '',
      to: '',
      directed: true,
      label: '',
      given: false,
      style: 'dashed',
    });
    // The count is what the UI uses to know how many connections are still owed.
    expect(safe.connections.filter((c) => !c.given)).toHaveLength(1);
  });

  it('strips the correct option of blank slots only', () => {
    const safe = toStudentSafeDiagramSpec(diagram, 'seed')!;
    expect(safe.slots[0]!.correctOption).toBe('plus');
    expect(safe.slots[1]!.correctOption).toBe('');
    expect(safe.slots[1]!.paletteId).toBe('charge');
  });

  it('shuffles the word bank, which is otherwise ordered answers-first', () => {
    const safe = toStudentSafeDiagramSpec(diagram, 'assignment-1:0')!;
    expect([...safe.labelBank].sort()).toEqual([...diagram.labelBank].sort());
    expect(safe.labelBank).not.toEqual(diagram.labelBank);
  });

  it('shuffles the same way for the same seed and differently for another', () => {
    const a = toStudentSafeDiagramSpec(diagram, 'assignment-1:0')!;
    const b = toStudentSafeDiagramSpec(diagram, 'assignment-1:0')!;
    const c = toStudentSafeDiagramSpec(diagram, 'assignment-1:4')!;
    expect(a.labelBank).toEqual(b.labelBank);
    expect(c.labelBank).not.toEqual(a.labelBank);
  });

  it('leaves no blank answer anywhere else in the serialized payload', () => {
    const safe = toStudentSafeDiagramSpec(diagram, 'seed')!;
    // The word bank legitimately still contains every answer -- that is what a word bank
    // is -- so it is excluded before checking that nothing else names them.
    const withoutBank = JSON.stringify({ ...safe, labelBank: [] });
    expect(withoutBank).not.toContain('Respiration');
    expect(withoutBank).not.toContain('Combustion');
    expect(withoutBank).not.toContain('aerobic respiration');
    expect(withoutBank).not.toContain('minus');
    // The given node's label is not an answer and must survive.
    expect(withoutBank).toContain('Photosynthesis');
  });

  it('returns null for a question with no diagram', () => {
    expect(toStudentSafeDiagramSpec(null, 'seed')).toBeNull();
  });
});
