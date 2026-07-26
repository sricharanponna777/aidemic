import { describe, expect, it } from 'vitest';
import type { DiagramConnection, DiagramNode, DiagramSlot, DiagramSpec, DiagramSubmission } from '@/types';
import { labelMatchesNode, markDiagramAnswer } from './diagramMarking';

// --- factories ---------------------------------------------------------------------------------

const node = (over: Partial<DiagramNode> & { id: string; correctLabel: string }): DiagramNode => ({
  x: 0,
  y: 0,
  acceptableLabels: [],
  given: false,
  role: 'label',
  ...over,
});

const connection = (over: Partial<DiagramConnection> & { from: string; to: string }): DiagramConnection => ({
  directed: false,
  label: '',
  given: false,
  style: 'solid',
  ...over,
});

const slot = (over: Partial<DiagramSlot> & { id: string; paletteId: string; correctOption: string }): DiagramSlot => ({
  x: 0,
  y: 0,
  given: false,
  description: '',
  group: '',
  ...over,
});

const spec = (over: Partial<DiagramSpec>): DiagramSpec => ({
  kind: 'template',
  title: 'Test diagram',
  primitives: [],
  nodes: [],
  connections: [],
  slots: [],
  labelBank: [],
  ...over,
});

const submission = (over: Partial<DiagramSubmission>): DiagramSubmission => ({
  labels: [],
  connections: [],
  slots: [],
  ...over,
});

// --- labelMatchesNode --------------------------------------------------------------------------

describe('labelMatchesNode', () => {
  const n = node({ id: 'n', correctLabel: 'Cell membrane', acceptableLabels: ['plasma membrane', 'membrane'] });

  it('matches the exact correct label', () => {
    expect(labelMatchesNode('Cell membrane', n)).toBe(true);
  });

  it('ignores case, surrounding whitespace and punctuation', () => {
    expect(labelMatchesNode('  cell membrane. ', n)).toBe(true);
    expect(labelMatchesNode('CELL MEMBRANE', n)).toBe(true);
  });

  it('accepts any acceptableLabels synonym', () => {
    expect(labelMatchesNode('Plasma Membrane', n)).toBe(true);
    expect(labelMatchesNode('membrane', n)).toBe(true);
  });

  it('rejects a genuinely different answer and the empty string', () => {
    expect(labelMatchesNode('cell wall', n)).toBe(false);
    expect(labelMatchesNode('', n)).toBe(false);
    expect(labelMatchesNode('   ', n)).toBe(false);
  });
});

// --- labels ------------------------------------------------------------------------------------

describe('markDiagramAnswer — labels', () => {
  const twoBlankLabels = spec({
    nodes: [
      node({ id: 'a', correctLabel: 'Nucleus' }),
      node({ id: 'b', correctLabel: 'Mitochondria', acceptableLabels: ['mitochondrion'] }),
    ],
  });

  it('awards full marks when every blank label is correct', () => {
    const result = markDiagramAnswer(twoBlankLabels, submission({ labels: [
      { nodeId: 'a', label: 'nucleus' },
      { nodeId: 'b', label: 'Mitochondria' },
    ] }), 2);
    expect(result.marksAwarded).toBe(2);
    expect(result.maxMarks).toBe(2);
    expect(result.band).toBe('Top band');
    expect(result.weaknessTags).toHaveLength(0);
  });

  it('accepts a synonym via acceptableLabels', () => {
    const result = markDiagramAnswer(twoBlankLabels, submission({ labels: [
      { nodeId: 'a', label: 'Nucleus' },
      { nodeId: 'b', label: 'mitochondrion' }, // singular synonym
    ] }), 2);
    expect(result.marksAwarded).toBe(2);
  });

  it('marks a wrong label incorrect and reports the correct one', () => {
    const result = markDiagramAnswer(twoBlankLabels, submission({ labels: [
      { nodeId: 'a', label: 'Nucleus' },
      { nodeId: 'b', label: 'Golgi body' },
    ] }), 2);
    expect(result.marksAwarded).toBe(1);
    expect(result.improvements.join(' ')).toContain('Mitochondria');
    expect(result.weaknessTags.length).toBeGreaterThan(0);
  });

  it('treats a missing label as unearned but still marks the others', () => {
    const result = markDiagramAnswer(twoBlankLabels, submission({ labels: [{ nodeId: 'a', label: 'Nucleus' }] }), 2);
    expect(result.marksAwarded).toBe(1);
    expect(result.improvements.join(' ')).toContain('Missing label');
  });

  it('never grades a given (pre-filled) node', () => {
    const withGiven = spec({
      nodes: [node({ id: 'a', correctLabel: 'Nucleus' }), node({ id: 'given', correctLabel: 'Cell wall', given: true })],
    });
    const result = markDiagramAnswer(withGiven, submission({ labels: [{ nodeId: 'a', label: 'Nucleus' }] }), 1);
    expect(result.marksAwarded).toBe(1);
    expect(result.maxMarks).toBe(1); // only the one blank node is a feature
  });
});

// --- connections -------------------------------------------------------------------------------

describe('markDiagramAnswer — connections', () => {
  it('credits an undirected connection drawn in either direction', () => {
    const s = spec({
      nodes: [node({ id: 'x', correctLabel: 'X', given: true }), node({ id: 'y', correctLabel: 'Y', given: true })],
      connections: [connection({ from: 'x', to: 'y', directed: false })],
    });
    expect(markDiagramAnswer(s, submission({ connections: [{ from: 'y', to: 'x' }] }), 1).marksAwarded).toBe(1);
  });

  it('requires the exact direction for a directed connection', () => {
    const s = spec({
      nodes: [node({ id: 'x', correctLabel: 'X', given: true }), node({ id: 'y', correctLabel: 'Y', given: true })],
      connections: [connection({ from: 'x', to: 'y', directed: true })],
    });
    expect(markDiagramAnswer(s, submission({ connections: [{ from: 'y', to: 'x' }] }), 1).marksAwarded).toBe(0);
    expect(markDiagramAnswer(s, submission({ connections: [{ from: 'x', to: 'y' }] }), 1).marksAwarded).toBe(1);
  });

  it('credits each required link at most once and reports leftover student links as spurious (unpenalised)', () => {
    const s = spec({
      nodes: [node({ id: 'x', correctLabel: 'X', given: true }), node({ id: 'y', correctLabel: 'Y', given: true })],
      connections: [connection({ from: 'x', to: 'y', directed: false })],
    });
    const result = markDiagramAnswer(s, submission({ connections: [{ from: 'x', to: 'y' }, { from: 'y', to: 'x' }] }), 1);
    expect(result.marksAwarded).toBe(1); // one required link -> max one mark, duplicate not penalised
    expect(result.maxMarks).toBe(1);
    expect(result.improvements.join(' ')).toContain('not part of the correct diagram');
  });
});

// --- slots -------------------------------------------------------------------------------------

describe('markDiagramAnswer — slots', () => {
  const s = spec({ slots: [slot({ id: 's1', paletteId: 'dot-cross', correctOption: 'dot', description: 'Shared pair' })] });

  it('awards the mark for the correct option id', () => {
    expect(markDiagramAnswer(s, submission({ slots: [{ slotId: 's1', optionId: 'dot' }] }), 1).marksAwarded).toBe(1);
  });

  it('withholds the mark and names the correct symbol when wrong', () => {
    const result = markDiagramAnswer(s, submission({ slots: [{ slotId: 's1', optionId: 'cross' }] }), 1);
    expect(result.marksAwarded).toBe(0);
    expect(result.improvements.join(' ')).toContain('Shared pair');
  });
});

// --- grouped (order-independent) slots ---------------------------------------------------------

describe('markDiagramAnswer — grouped slots (order does not matter)', () => {
  // A bonding pair: one dot + one cross, in either position.
  const pair = spec({
    slots: [
      slot({ id: 'p-dot', paletteId: 'dot-cross', correctOption: 'dot', group: 'bond0' }),
      slot({ id: 'p-cross', paletteId: 'dot-cross', correctOption: 'cross', group: 'bond0' }),
    ],
  });

  it('gives full marks when the dot and cross are placed the "expected" way round', () => {
    expect(markDiagramAnswer(pair, submission({ slots: [{ slotId: 'p-dot', optionId: 'dot' }, { slotId: 'p-cross', optionId: 'cross' }] }), 2).marksAwarded).toBe(2);
  });

  it('gives full marks when the dot and cross are swapped', () => {
    // dot placed in the "cross" slot and vice-versa — chemically identical, must still be full marks.
    expect(markDiagramAnswer(pair, submission({ slots: [{ slotId: 'p-dot', optionId: 'cross' }, { slotId: 'p-cross', optionId: 'dot' }] }), 2).marksAwarded).toBe(2);
  });

  it('awards partial credit by multiset when the counts are wrong', () => {
    // two dots, no cross -> only one of the two required symbols is present.
    expect(markDiagramAnswer(pair, submission({ slots: [{ slotId: 'p-dot', optionId: 'dot' }, { slotId: 'p-cross', optionId: 'dot' }] }), 2).marksAwarded).toBe(1);
  });

  it('grades an anion shell (7 crosses + 1 dot) by count, not position', () => {
    const shell = spec({
      slots: Array.from({ length: 8 }, (_, i) =>
        slot({ id: `e${i}`, paletteId: 'dot-cross', correctOption: i === 7 ? 'dot' : 'cross', group: 'anion-shell' })
      ),
    });
    // Put the single dot in position 0 instead of the "expected" position 7 — still fully correct.
    const placed = submission({
      slots: Array.from({ length: 8 }, (_, i) => ({ slotId: `e${i}`, optionId: i === 0 ? 'dot' : 'cross' })),
    });
    expect(markDiagramAnswer(shell, placed, 8).marksAwarded).toBe(8);
  });
});

// --- no answer & banding -----------------------------------------------------------------------

describe('markDiagramAnswer — no answer and banding', () => {
  const oneBlank = spec({ nodes: [node({ id: 'a', correctLabel: 'Nucleus' })] });

  it('returns a "No answer" result for an empty submission', () => {
    const result = markDiagramAnswer(oneBlank, submission({}), 1);
    expect(result.marksAwarded).toBe(0);
    expect(result.band).toBe('No answer');
  });

  it('returns "No answer" for null/garbage submissions', () => {
    expect(markDiagramAnswer(oneBlank, null, 1).band).toBe('No answer');
    expect(markDiagramAnswer(oneBlank, 'not-an-object', 1).band).toBe('No answer');
  });

  it('reports "No credit yet" when an answer was given but nothing is correct', () => {
    const result = markDiagramAnswer(oneBlank, submission({ labels: [{ nodeId: 'a', label: 'wrong' }] }), 1);
    expect(result.marksAwarded).toBe(0);
    expect(result.band).toBe('No credit yet');
  });

  it('bands partial scores by ratio', () => {
    const tenBlanks = spec({ nodes: Array.from({ length: 10 }, (_, i) => node({ id: `n${i}`, correctLabel: `L${i}` })) });
    const answerFirst = (count: number) =>
      submission({ labels: Array.from({ length: count }, (_, i) => ({ nodeId: `n${i}`, label: `L${i}` })) });
    expect(markDiagramAnswer(tenBlanks, answerFirst(9), 10).band).toBe('Top band'); // 0.9
    expect(markDiagramAnswer(tenBlanks, answerFirst(7), 10).band).toBe('Secure'); // 0.7
    expect(markDiagramAnswer(tenBlanks, answerFirst(5), 10).band).toBe('Developing'); // 0.5
    expect(markDiagramAnswer(tenBlanks, answerFirst(3), 10).band).toBe('Limited'); // 0.3
  });
});

// --- mark scaling / fairness -------------------------------------------------------------------

describe('markDiagramAnswer — scaling to the question mark value', () => {
  const fiveBlanks = spec({ nodes: Array.from({ length: 5 }, (_, i) => node({ id: `n${i}`, correctLabel: `L${i}` })) });
  const answerFirst = (count: number) =>
    submission({ labels: Array.from({ length: count }, (_, i) => ({ nodeId: `n${i}`, label: `L${i}` })) });

  it('never rounds a positive score down to zero marks', () => {
    // 1 of 5 features on a 2-mark question -> round(0.4) = 0, floored up to 1.
    const result = markDiagramAnswer(fiveBlanks, answerFirst(1), 2);
    expect(result.marksAwarded).toBe(1);
    expect(result.maxMarks).toBe(2);
  });

  it('rounds intermediate scores to the nearest mark', () => {
    // 3 of 5 -> round(1.2) = 1.
    expect(markDiagramAnswer(fiveBlanks, answerFirst(3), 2).marksAwarded).toBe(1);
  });

  it('clamps a fully-correct answer to the question mark value', () => {
    const result = markDiagramAnswer(fiveBlanks, answerFirst(5), 2);
    expect(result.marksAwarded).toBe(2);
    expect(result.maxMarks).toBe(2);
    expect(result.band).toBe('Top band');
  });
});

// --- legacy backfill ---------------------------------------------------------------------------

describe('markDiagramAnswer — legacy specs', () => {
  it('marks a spec saved before role/acceptableLabels/slots existed', () => {
    // Simulate an old stored spec: nodes lack role & acceptableLabels, spec lacks slots.
    const legacy = {
      kind: 'structural',
      title: 'Legacy',
      primitives: [],
      nodes: [{ id: 'a', x: 10, y: 10, correctLabel: 'Nucleus', given: false }],
      connections: [],
      labelBank: [],
    } as unknown as DiagramSpec;
    const result = markDiagramAnswer(legacy, submission({ labels: [{ nodeId: 'a', label: 'nucleus' }] }), 1);
    expect(result.marksAwarded).toBe(1);
  });
});
