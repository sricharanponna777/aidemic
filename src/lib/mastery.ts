/**
 * The mastery model — the memory maths behind `student_subtopic_mastery`.
 *
 * Every surface in the app (exam practice, assignments, flashcards, blurting,
 * cloze, the tutor, homework scans, self-ratings) emits evidence about one
 * learning objective. This module folds that evidence into a single belief
 * state per (student, objective), which the knowledge graph, planner, adaptive
 * difficulty engine, class heatmap and grade forecast all read.
 *
 * Why not reuse spacedRepetition.ts? SM-2 assumes one source, a regular review
 * cadence and a 0-5 self-graded quality. Curriculum mastery gets irregular
 * evidence of wildly differing trustworthiness — a timed mock and a red/amber/
 * green self-rating cannot move the belief by the same amount. So this model
 * carries two extra variables SM-2 has no place for:
 *
 *   `weight`     how much a single piece of evidence is allowed to move things
 *   `confidence` how much evidence backs the estimate at all
 *
 * `confidence` is what stops the product from lying. "You are weak at
 * electrolysis" off one wrong answer and off twenty are different claims, and
 * the UI must be able to tell them apart — a student opening the knowledge
 * graph on day one should see grey (unknown), never a wall of red.
 *
 * Everything here is pure. `student_subtopic_mastery` is a derived table: it can be
 * rebuilt at any time by replaying `mastery_events` through masteryFromEvents(),
 * which is what makes it safe to change these constants later.
 */

/** Fraction of `strength` still retrievable after exactly `stability` days. */
export const TARGET_RETENTION = 0.9;

/** Outcome at or above which the evidence counts as a successful recall. */
export const PASS_THRESHOLD = 0.6;

/** Stability (days) granted by the very first piece of evidence. */
export const INITIAL_STABILITY_PASS_DAYS = 1;
export const INITIAL_STABILITY_FAIL_DAYS = 0.2;

export const MIN_STABILITY_DAYS = 0.2;
/** Two GCSE years; intervals beyond this are indistinguishable from "known". */
export const MAX_STABILITY_DAYS = 180;

/** Multiplier applied to stability on a lapse, before the quality adjustment. */
export const LAPSE_FACTOR = 0.35;
/** Base fractional stability growth on a successful recall. */
export const SUCCESS_GROWTH = 0.6;

/** Total evidence weight at which confidence reaches ~63%. */
export const CONFIDENCE_SCALE = 4;
/** Below this, the UI must render the objective as unknown rather than weak. */
export const MIN_CONFIDENCE_TO_DISPLAY = 0.3;

const BASE_ALPHA = 0.5;
const MIN_ALPHA = 0.1;
const MAX_ALPHA = 0.8;

const DAY_MS = 86400000;

export type MasterySource =
  | 'exam_practice'
  | 'assignment'
  | 'mock'
  | 'flashcard'
  | 'blurt'
  | 'cloze'
  | 'tutor'
  | 'homework_scan'
  | 'essay'
  | 'self_rating';

/**
 * How far each source is trusted to move the belief.
 *
 * A timed mock under exam conditions is the strongest signal we get; a student
 * colouring an objective green is the weakest. Keeping this as data rather than
 * burying it at each call site means the ordering is reviewable in one place.
 */
export const EVIDENCE_WEIGHTS: Record<MasterySource, number> = {
  mock: 1.5,
  exam_practice: 1.2,
  assignment: 1.2,
  homework_scan: 1.0,
  essay: 1.0,
  tutor: 0.6,
  blurt: 0.6,
  cloze: 0.5,
  flashcard: 0.5,
  self_rating: 0.2,
};

export type MasteryBand = 'unknown' | 'weak' | 'developing' | 'secure' | 'mastered';

export interface MasteryState {
  /** 0..1 consolidated belief as at `lastSeenAt`, before decay. */
  strength: number;
  /** Days from `lastSeenAt` until strength decays to TARGET_RETENTION of itself. */
  stability: number;
  /** 0..1 how much evidence backs this estimate. */
  confidence: number;
  evidenceCount: number;
  lastSeenAt: string | null;
  dueAt: string | null;
}

export interface MasteryEvidence {
  /** Normalised 0..1 performance on this piece of evidence. */
  outcome: number;
  /** Defaults to 1. Use EVIDENCE_WEIGHTS[source]. */
  weight?: number;
  /** When it happened. Defaults to now. */
  at?: Date | string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);

/** Coerces anything the DB or an LLM might hand us into a usable number. */
const finite = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toTime = (value: Date | string | null | undefined): number | null => {
  if (!value) return null;
  const ts = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
};

export const initialMasteryState = (): MasteryState => ({
  strength: 0,
  stability: 0,
  confidence: 0,
  evidenceCount: 0,
  lastSeenAt: null,
  dueAt: null,
});

/** Marks scored on a question/paper as a 0..1 outcome. */
export const outcomeFromMarks = (awarded: number, available: number): number => {
  const total = finite(available);
  if (total <= 0) return 0;
  return clamp01(finite(awarded) / total);
};

/** Red/amber/green self-rating as a 0..1 outcome. */
export const outcomeFromSelfRating = (rating: 'red' | 'amber' | 'green'): number =>
  rating === 'green' ? 1 : rating === 'amber' ? 0.5 : 0;

/**
 * An SM-2 review grade (0 Again, 1 Hard, 2 Good, 3 Easy) as a 0..1 outcome.
 *
 * Calibrated against PASS_THRESHOLD: Again and Hard fall below it and count as
 * lapses, Good and Easy above it and count as successful recalls, which is what
 * those buttons mean in SM-2.
 */
export const outcomeFromReviewQuality = (quality: number): number =>
  [0, 0.4, 0.8, 1][clamp(Math.trunc(finite(quality)), 0, 3)];

/**
 * Strength projected forward to `at`, after forgetting.
 *
 * Callers must use this rather than reading `state.strength` directly — the
 * stored column is the value at `lastSeenAt` and is stale by definition.
 */
export function retrievabilityAt(state: MasteryState, at: Date | string = new Date()): number {
  const strength = clamp01(finite(state.strength));
  const stability = finite(state.stability);
  const lastSeen = toTime(state.lastSeenAt);
  const now = toTime(at);

  if (strength <= 0 || stability <= 0 || lastSeen === null || now === null) return strength;

  const elapsedDays = Math.max(0, (now - lastSeen) / DAY_MS);
  return clamp01(strength * Math.pow(TARGET_RETENTION, elapsedDays / stability));
}

/** Whether this objective is due for review at `at`. */
export function isDue(state: MasteryState, at: Date | string = new Date()): boolean {
  const due = toTime(state.dueAt);
  const now = toTime(at);
  if (due === null || now === null) return state.evidenceCount === 0;
  return now >= due;
}

/**
 * Fold one piece of evidence into the belief state.
 *
 * Stability grows multiplicatively on success and contracts on failure. The
 * growth is largest when the item was nearly forgotten at the moment of recall
 * (the spacing effect), which is why `retrievabilityAt` is computed before the
 * update rather than after.
 */
export function applyEvidence(state: MasteryState, evidence: MasteryEvidence): MasteryState {
  const at = evidence.at ?? new Date();
  const now = toTime(at) ?? Date.now();
  const outcome = clamp01(finite(evidence.outcome));
  const weight = clamp(finite(evidence.weight, 1), 0.01, 5);
  // Scales stability growth and the strength learning rate by trustworthiness,
  // floored so a weak signal still moves things a little.
  const weightFactor = clamp(weight, 0.25, 1.5);

  const passed = outcome >= PASS_THRESHOLD;
  const priorRetrievability = retrievabilityAt(state, new Date(now));

  let stability: number;
  if (state.evidenceCount === 0 || finite(state.stability) <= 0) {
    stability = passed ? INITIAL_STABILITY_PASS_DAYS : INITIAL_STABILITY_FAIL_DAYS;
  } else if (passed) {
    // Recalling something you had nearly lost is worth more than drilling
    // something you just saw.
    const spacingBonus = 1 + (1 - priorRetrievability);
    const qualityBonus = 0.5 + outcome;
    const growth = SUCCESS_GROWTH * spacingBonus * qualityBonus * weightFactor;
    stability = state.stability * (1 + growth);
  } else {
    // A near-miss costs less than a blank.
    stability = state.stability * LAPSE_FACTOR * (0.5 + outcome);
  }
  stability = clamp(stability, MIN_STABILITY_DAYS, MAX_STABILITY_DAYS);

  const alpha = clamp(BASE_ALPHA * weightFactor, MIN_ALPHA, MAX_ALPHA);
  const strength = clamp01(priorRetrievability + (outcome - priorRetrievability) * alpha);

  // Independent-evidence accumulation: equivalent to 1 - exp(-totalWeight/SCALE)
  // without having to store the running total.
  const priorConfidence = clamp01(finite(state.confidence));
  const confidence = clamp01(
    priorConfidence + (1 - priorConfidence) * (1 - Math.exp(-weight / CONFIDENCE_SCALE))
  );

  return {
    strength,
    stability,
    confidence,
    evidenceCount: Math.max(0, Math.trunc(finite(state.evidenceCount))) + 1,
    lastSeenAt: new Date(now).toISOString(),
    dueAt: new Date(now + stability * DAY_MS).toISOString(),
  };
}

/**
 * Rebuild a belief state from scratch by replaying its evidence.
 *
 * This is the migration path: `student_subtopic_mastery` is derived, so changing the
 * model above means re-deriving rather than writing a data migration. Also used
 * to backfill history and by the nightly consistency job.
 */
export function masteryFromEvents(events: (MasteryEvidence & { at: Date | string })[]): MasteryState {
  return [...events]
    .sort((a, b) => (toTime(a.at) ?? 0) - (toTime(b.at) ?? 0))
    .reduce<MasteryState>(applyEvidence, initialMasteryState());
}

/**
 * Bucket for display — colours the knowledge graph.
 *
 * Returns 'unknown' whenever the evidence is too thin to make a claim, which is
 * the rule that keeps the graph honest: an objective nobody has tested must
 * look untested, not weak.
 */
export function masteryBand(state: MasteryState, at: Date | string = new Date()): MasteryBand {
  if (state.evidenceCount <= 0 || clamp01(finite(state.confidence)) < MIN_CONFIDENCE_TO_DISPLAY) {
    return 'unknown';
  }

  const r = retrievabilityAt(state, at);
  if (r >= 0.85) return 'mastered';
  if (r >= 0.65) return 'secure';
  if (r >= 0.4) return 'developing';
  return 'weak';
}
