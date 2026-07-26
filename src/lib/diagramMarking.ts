import type { DiagramNode, DiagramSlot, DiagramSpec, DiagramSubmission } from '@/types';
import { getDiagramPalette } from './diagrams/paletteRegistry';

export interface DiagramMarkResult {
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
  correct: boolean;
  line: string;
}

const WEAKNESS_TAG = 'Diagram labelling and connections';

const getBand = (marksAwarded: number, maxMarks: number) => {
  if (marksAwarded <= 0) return 'No credit yet';
  const ratio = marksAwarded / Math.max(maxMarks, 1);
  if (ratio >= 0.85) return 'Top band';
  if (ratio >= 0.65) return 'Secure';
  if (ratio >= 0.4) return 'Developing';
  return 'Limited';
};

const normalizeLabel = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?()]/g, '')
    .trim();

/** A placed label is correct if it matches the node's correctLabel OR any of its acceptableLabels
 * (synonyms / alternative spellings), all compared case/punctuation-insensitively. */
export const labelMatchesNode = (placed: string, node: Pick<DiagramNode, 'correctLabel' | 'acceptableLabels'>): boolean => {
  const target = normalizeLabel(placed);
  if (!target) return false;
  if (target === normalizeLabel(node.correctLabel)) return true;
  return (node.acceptableLabels ?? []).some((alt) => normalizeLabel(alt) === target);
};

/** Partition blank slots for grading: slots sharing a non-empty `group` are one order-independent
 * set; every ungrouped slot is its own singleton. */
const groupBlankSlots = (blankSlots: DiagramSlot[]): DiagramSlot[][] => {
  const map = new Map<string, DiagramSlot[]>();
  for (const slot of blankSlots) {
    const key = slot.group ? `g:${slot.group}` : `s:${slot.id}`;
    const arr = map.get(key);
    if (arr) arr.push(slot);
    else map.set(key, [slot]);
  }
  return [...map.values()];
};

/** Per-slot correctness. A grouped slot is correct if its placed symbol can be matched (greedily)
 * against the group's remaining required multiset — so which position got which symbol never matters,
 * only that the right set of symbols is present. Ungrouped slots need their own exact option. */
export const computeSlotCorrectness = (blankSlots: DiagramSlot[], optionBySlot: Map<string, string>): Map<string, boolean> => {
  const result = new Map<string, boolean>();
  for (const slots of groupBlankSlots(blankSlots)) {
    if (slots.length === 1 && !slots[0].group) {
      const s = slots[0];
      const placed = optionBySlot.get(s.id) ?? '';
      result.set(s.id, placed.length > 0 && placed === s.correctOption);
      continue;
    }
    const remaining = new Map<string, number>();
    for (const s of slots) remaining.set(s.correctOption, (remaining.get(s.correctOption) ?? 0) + 1);
    for (const s of slots) {
      const placed = optionBySlot.get(s.id) ?? '';
      const available = remaining.get(placed) ?? 0;
      const correct = placed.length > 0 && available > 0;
      if (correct) remaining.set(placed, available - 1);
      result.set(s.id, correct);
    }
  }
  return result;
};

/** Review-time helper for the UI: per-blank-slot correctness for a submission, using the same
 * order-independent grouping as marking so a swapped-but-valid electron shows green, not amber. */
export const gradeDiagramSlots = (diagramSpecRaw: DiagramSpec, submission: DiagramSubmission | null | undefined): Map<string, boolean> => {
  const spec = withDefaults(diagramSpecRaw);
  const blankSlots = spec.slots.filter((slot) => !slot.given);
  const optionBySlot = new Map<string, string>();
  for (const item of submission?.slots ?? []) {
    if (item && typeof item.slotId === 'string' && typeof item.optionId === 'string') optionBySlot.set(item.slotId, item.optionId);
  }
  return computeSlotCorrectness(blankSlots, optionBySlot);
};

const buildExemplarAnswer = (spec: DiagramSpec): string => {
  const labelLine = spec.nodes.filter((node) => node.role === 'label').map((node) => node.correctLabel).join(', ');
  const missing = spec.connections.filter((c) => !c.given);
  const byId = new Map(spec.nodes.map((node) => [node.id, node.correctLabel]));
  // Anchor nodes (ray-diagram kink points etc.) have an empty correctLabel — fall back to the id
  // so a connection exemplar never renders a dangling "Object — ".
  const connLine = missing
    .map((c) => `${byId.get(c.from) || c.from} ${c.directed ? '→' : '—'} ${byId.get(c.to) || c.to}`)
    .join('; ');
  const slotLine = spec.slots
    .filter((slot) => !slot.given)
    .map((slot) => `${slot.description || slot.id}: ${getDiagramPalette(slot.paletteId)?.options.find((o) => o.id === slot.correctOption)?.label ?? slot.correctOption}`)
    .join('; ');
  const parts = [labelLine && `Labels: ${labelLine}.`, connLine && `Connections: ${connLine}.`, slotLine && `Symbols: ${slotLine}.`].filter(Boolean);
  return parts.join(' ');
};

const buildResult = (features: FeatureResult[], exemplarAnswer: string, extraImprovements: string[]): DiagramMarkResult => {
  const marksAwarded = features.filter((f) => f.correct).length;
  const maxMarks = features.length;
  const strengths = features.filter((f) => f.correct).map((f) => f.line);
  const improvements = [...features.filter((f) => !f.correct).map((f) => f.line), ...extraImprovements];

  return {
    marksAwarded,
    maxMarks,
    band: getBand(marksAwarded, maxMarks),
    feedback: features.map((f) => f.line).join(' '),
    strengths,
    improvements,
    weaknessTags: features.some((f) => !f.correct) ? [WEAKNESS_TAG] : [],
    exemplarAnswer,
  };
};

/** Diagram data saved before slots/role existed (older attempts/assignments) may lack these
 * fields entirely -- treat missing as their pre-template-era meaning: no slots, every node a
 * plain label. */
const withDefaults = (spec: DiagramSpec): DiagramSpec => ({
  ...spec,
  nodes: (spec.nodes ?? []).map((node) => ({ ...node, role: node.role ?? 'label', acceptableLabels: node.acceptableLabels ?? [] })),
  connections: spec.connections ?? [],
  slots: (spec.slots ?? []).map((slot) => ({ ...slot, group: slot.group ?? '' })),
});

/** Deterministically marks a diagram-completion submission against its DiagramSpec: one mark
 * per blank node (correct label placed) and one per missing connection (correct link drawn).
 * Never delegates to the AI — structural comparison is exact, mirroring markPlotAnswer. */
export const markDiagramAnswer = (diagramSpecRaw: DiagramSpec, submissionRaw: unknown, maxMarks: number): DiagramMarkResult => {
  const diagramSpec = withDefaults(diagramSpecRaw);
  const exemplarAnswer = buildExemplarAnswer(diagramSpec);

  const blankNodes = diagramSpec.nodes.filter((node) => !node.given && node.role === 'label');
  const missingConnections = diagramSpec.connections.filter((connection) => !connection.given);
  const blankSlots = diagramSpec.slots.filter((slot) => !slot.given);

  const noAnswer = (): DiagramMarkResult => ({
    marksAwarded: 0,
    maxMarks,
    band: 'No answer',
    feedback: 'No diagram answer was submitted for this question.',
    strengths: [],
    improvements: [],
    weaknessTags: [],
    exemplarAnswer,
  });

  if (!submissionRaw || typeof submissionRaw !== 'object') return noAnswer();
  const submission = submissionRaw as DiagramSubmission;
  const submittedLabels = Array.isArray(submission.labels) ? submission.labels : [];
  const submittedConnections = Array.isArray(submission.connections) ? submission.connections : [];
  const submittedSlots = Array.isArray(submission.slots) ? submission.slots : [];
  if (submittedLabels.length === 0 && submittedConnections.length === 0 && submittedSlots.length === 0) return noAnswer();

  const labelByNode = new Map<string, string>();
  for (const item of submittedLabels) {
    if (item && typeof item.nodeId === 'string' && typeof item.label === 'string') {
      labelByNode.set(item.nodeId, item.label);
    }
  }
  const nodeLabel = new Map(diagramSpec.nodes.map((node) => [node.id, node.correctLabel]));

  const labelFeatures: FeatureResult[] = blankNodes.map((node) => {
    const placed = labelByNode.get(node.id) ?? '';
    const correct = labelMatchesNode(placed, node);
    return {
      correct,
      line: correct
        ? `"${node.correctLabel}" labelled correctly.`
        : placed
          ? `Label "${placed}" is wrong here — the correct label is "${node.correctLabel}".`
          : `Missing label: this part should be "${node.correctLabel}".`,
    };
  });

  // Consume matched student connections so each required link is credited at most once and
  // leftover student links can be reported as spurious (mirrors the scatter point-matching).
  const remaining = submittedConnections
    .filter((c) => c && typeof c.from === 'string' && typeof c.to === 'string')
    .map((c) => ({ from: c.from, to: c.to }));

  const connectionFeatures: FeatureResult[] = missingConnections.map((connection) => {
    const matchIndex = remaining.findIndex((c) =>
      connection.directed
        ? c.from === connection.from && c.to === connection.to
        : (c.from === connection.from && c.to === connection.to) || (c.from === connection.to && c.to === connection.from)
    );
    const correct = matchIndex >= 0;
    if (correct) remaining.splice(matchIndex, 1);
    const fromLabel = nodeLabel.get(connection.from) ?? connection.from;
    const toLabel = nodeLabel.get(connection.to) ?? connection.to;
    const arrow = connection.directed ? '→' : '—';
    return {
      correct,
      line: correct
        ? `Connection ${fromLabel} ${arrow} ${toLabel} drawn correctly.`
        : `Missing connection: ${fromLabel} ${arrow} ${toLabel}.`,
    };
  });

  // Leftover student connections not matched to any required link — note but do not penalise
  // marks (feature count stays equal to the gradeable items so maxMarks matches the AI's marks).
  const extraImprovements: string[] = [];
  const spurious = remaining.filter(
    (c) => !diagramSpec.connections.some((known) => known.from === c.from && known.to === c.to)
  );
  if (spurious.length > 0) {
    extraImprovements.push(`You drew ${spurious.length} connection(s) that are not part of the correct diagram.`);
  }

  const optionBySlot = new Map<string, string>();
  for (const item of submittedSlots) {
    if (item && typeof item.slotId === 'string' && typeof item.optionId === 'string') {
      optionBySlot.set(item.slotId, item.optionId);
    }
  }

  // Slots sharing a non-empty `group` are graded as an order-independent SET — only the multiset of
  // symbols matters, not which slot got which (e.g. the dot and cross of a bonding pair are
  // interchangeable). `computeSlotCorrectness` is the single source of truth, reused by the review UI.
  const slotCorrect = computeSlotCorrectness(blankSlots, optionBySlot);
  const slotFeatures: FeatureResult[] = [];
  for (const slots of groupBlankSlots(blankSlots)) {
    const palette = getDiagramPalette(slots[0].paletteId);
    const optionLabel = (id: string) => palette?.options.find((o) => o.id === id)?.label ?? id;

    if (slots.length === 1 && !slots[0].group) {
      const slot = slots[0];
      const correct = slotCorrect.get(slot.id) ?? false;
      const name = slot.description || 'Symbol';
      slotFeatures.push({
        correct,
        line: correct ? `${name} correct (${optionLabel(slot.correctOption)}).` : `${name} should be "${optionLabel(slot.correctOption)}".`,
      });
      continue;
    }

    const required = new Map<string, number>();
    for (const s of slots) required.set(s.correctOption, (required.get(s.correctOption) ?? 0) + 1);
    const needDesc = [...required.entries()].map(([opt, n]) => `${n} × ${opt}`).join(', ');
    for (const slot of slots) {
      const correct = slotCorrect.get(slot.id) ?? false;
      slotFeatures.push({
        correct,
        line: correct ? 'Electron placed correctly.' : `Electron placement is wrong or missing — this group needs ${needDesc} (positions interchangeable).`,
      });
    }
  }

  const features = [...labelFeatures, ...connectionFeatures, ...slotFeatures];
  if (features.length === 0) return noAnswer();

  const result = buildResult(features, exemplarAnswer, extraImprovements);
  // Scale to the question's actual mark value if it differs from the feature count.
  if (result.maxMarks !== maxMarks && result.maxMarks > 0 && maxMarks > 0) {
    let scaled = Math.round((result.marksAwarded / result.maxMarks) * maxMarks);
    // Never round a student who got at least one feature right down to zero marks — a positive
    // raw score is worth at least one mark (e.g. 1 of 5 features on a 2-mark question).
    if (scaled === 0 && result.marksAwarded > 0) scaled = 1;
    scaled = Math.min(scaled, maxMarks);
    return { ...result, marksAwarded: scaled, maxMarks, band: getBand(scaled, maxMarks) };
  }
  return result;
};
