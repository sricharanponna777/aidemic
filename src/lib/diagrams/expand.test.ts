import { describe, expect, it } from 'vitest';
import type { DiagramSpec, DiagramSubmission, DiagramTemplateSelection } from '@/types';
import { expandDiagramTemplate } from './expand';
import { listDiagramTemplateIds } from './registry';
import { markDiagramAnswer } from '../diagramMarking';

const sel = (templateId: string, stringParams: [string, string][], listParams: [string, string[]][] = []): DiagramTemplateSelection => ({
  templateId,
  stringParams: stringParams.map(([key, value]) => ({ key, value })),
  numberParams: [],
  listParams: listParams.map(([key, values]) => ({ key, values })),
});

// A known-good parameter bag for every registered template. The "every registered id is covered"
// test below fails if a new template is added without an entry here — forcing this regression guard
// to stay complete.
const SAMPLE_PARAMS: Record<string, [string, string][]> = {
  'bonding-ionic': [['compoundId', 'nacl']],
  'bonding-covalent': [['moleculeId', 'h2o']],
  'atomic-structure': [['elementId', 'na']],
  'cell-diagram': [['cellType', 'animal']],
  'organ-diagram': [['organId', 'heart']],
  'apparatus-diagram': [['apparatusId', 'filtration']],
  'ray-diagram-lens': [['opticsType', 'converging-lens'], ['objectDistanceCategory', 'beyond-2f']],
  'ray-diagram-mirror': [['opticsType', 'concave-mirror'], ['objectDistanceCategory', 'between-f-and-2f']],
  'circuit-diagram': [['circuitId', 'series-lamp']],
  'wave-diagram': [['waveType', 'transverse']],
};

const featureCount = (spec: DiagramSpec): number =>
  spec.nodes.filter((n) => !n.given && n.role === 'label').length +
  spec.connections.filter((c) => !c.given).length +
  spec.slots.filter((s) => !s.given).length;

/** The fully-correct submission for a blanked spec: every blank node's correctLabel, every missing
 * connection, every blank slot's correctOption. */
const perfectSubmission = (spec: DiagramSpec): DiagramSubmission => ({
  labels: spec.nodes.filter((n) => !n.given && n.role === 'label').map((n) => ({ nodeId: n.id, label: n.correctLabel })),
  connections: spec.connections.filter((c) => !c.given).map((c) => ({ from: c.from, to: c.to })),
  slots: spec.slots.filter((s) => !s.given).map((s) => ({ slotId: s.id, optionId: s.correctOption })),
});

describe('diagram template registry', () => {
  it('has a sample parameter bag for every registered template', () => {
    for (const id of listDiagramTemplateIds()) {
      expect(SAMPLE_PARAMS, `missing SAMPLE_PARAMS entry for "${id}"`).toHaveProperty(id);
    }
  });

  // Blank-everything (empty blank* lists trigger the documented "blank all of that kind" fallback).
  for (const id of listDiagramTemplateIds()) {
    it(`expands "${id}" into an answerable, self-consistent diagram`, () => {
      const params = SAMPLE_PARAMS[id] ?? [];
      const spec = expandDiagramTemplate(sel(id, params));
      expect(spec, `"${id}" failed to expand`).not.toBeNull();
      if (!spec) return;

      expect(spec.title.length).toBeGreaterThan(0);
      const features = featureCount(spec);
      expect(features, `"${id}" produced no gradeable features`).toBeGreaterThan(0);

      // A perfect submission must earn full marks — proves the built geometry and the marker agree
      // (correctLabels are answerable, slot correctOptions are valid palette ids, etc.).
      const result = markDiagramAnswer(spec, perfectSubmission(spec), features);
      expect(result.marksAwarded, `"${id}" perfect answer did not score full marks`).toBe(features);
      expect(result.maxMarks).toBe(features);
    });
  }
});

describe('expandDiagramTemplate blanking', () => {
  it('respects a specific requested blankPartId (partial match)', () => {
    const spec = expandDiagramTemplate(sel('cell-diagram', [['cellType', 'animal']], [['blankPartIds', ['nucleus']]]));
    expect(spec).not.toBeNull();
    const blanks = spec!.nodes.filter((n) => !n.given);
    expect(blanks).toHaveLength(1);
    expect(blanks[0].id).toBe('nucleus');
  });

  it('falls back to blanking everything when no requested id matches', () => {
    const spec = expandDiagramTemplate(sel('cell-diagram', [['cellType', 'animal']], [['blankPartIds', ['does-not-exist']]]));
    expect(spec).not.toBeNull();
    const labelNodes = spec!.nodes.filter((n) => n.role === 'label');
    expect(labelNodes.every((n) => !n.given)).toBe(true);
  });

  it('returns null for an unknown templateId', () => {
    expect(expandDiagramTemplate(sel('no-such-template', []))).toBeNull();
  });

  it('returns null for invalid params', () => {
    expect(expandDiagramTemplate(sel('cell-diagram', [['cellType', 'not-a-cell']]))).toBeNull();
  });

  it('marks a covalent bond full marks even when the dot and cross are swapped', () => {
    const spec = expandDiagramTemplate(sel('bonding-covalent', [['moleculeId', 'h2']]))!;
    const dotSlot = spec.slots.find((s) => s.correctOption === 'dot')!;
    const crossSlot = spec.slots.find((s) => s.correctOption === 'cross')!;
    // deliberately swap: place a cross where a dot is "expected" and vice-versa.
    const swapped = { labels: [], connections: [], slots: [
      { slotId: dotSlot.id, optionId: 'cross' },
      { slotId: crossSlot.id, optionId: 'dot' },
    ] };
    const result = markDiagramAnswer(spec, swapped, 2);
    expect(result.marksAwarded).toBe(2);
  });
});
