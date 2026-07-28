import { describe, expect, it } from 'vitest';
import {
  applyEvidence,
  initialMasteryState,
  isDue,
  masteryBand,
  masteryFromEvents,
  outcomeFromMarks,
  outcomeFromReviewQuality,
  outcomeFromSelfRating,
  retrievabilityAt,
  PASS_THRESHOLD,
  CONFIDENCE_SCALE,
  EVIDENCE_WEIGHTS,
  MAX_STABILITY_DAYS,
  MIN_STABILITY_DAYS,
  MIN_CONFIDENCE_TO_DISPLAY,
  TARGET_RETENTION,
  type MasteryState,
} from './mastery';

const T0 = Date.parse('2026-07-01T00:00:00.000Z');
const at = (days: number) => new Date(T0 + days * 86400000).toISOString();

const pass = (day = 0, weight = 1) => ({ outcome: 1, weight, at: at(day) });
const fail = (day = 0, weight = 1) => ({ outcome: 0, weight, at: at(day) });

describe('outcomeFromMarks', () => {
  it('is the mark fraction', () => {
    expect(outcomeFromMarks(3, 4)).toBe(0.75);
  });
  it('is zero when no marks were available', () => {
    expect(outcomeFromMarks(2, 0)).toBe(0);
  });
  it('clamps a generous marker to 1', () => {
    expect(outcomeFromMarks(7, 5)).toBe(1);
  });
  it('treats non-numeric input as zero rather than NaN', () => {
    expect(outcomeFromMarks(Number.NaN, 5)).toBe(0);
  });
});

describe('outcomeFromSelfRating', () => {
  it('maps red/amber/green across the range', () => {
    expect(outcomeFromSelfRating('red')).toBe(0);
    expect(outcomeFromSelfRating('amber')).toBe(0.5);
    expect(outcomeFromSelfRating('green')).toBe(1);
  });
});

describe('outcomeFromReviewQuality', () => {
  it('maps the four SM-2 grades across the range', () => {
    expect(outcomeFromReviewQuality(0)).toBe(0);
    expect(outcomeFromReviewQuality(1)).toBe(0.4);
    expect(outcomeFromReviewQuality(2)).toBe(0.8);
    expect(outcomeFromReviewQuality(3)).toBe(1);
  });

  it('splits at PASS_THRESHOLD the way the grade buttons mean it', () => {
    // Again/Hard are lapses, Good/Easy are successful recalls.
    expect(outcomeFromReviewQuality(0)).toBeLessThan(PASS_THRESHOLD);
    expect(outcomeFromReviewQuality(1)).toBeLessThan(PASS_THRESHOLD);
    expect(outcomeFromReviewQuality(2)).toBeGreaterThanOrEqual(PASS_THRESHOLD);
    expect(outcomeFromReviewQuality(3)).toBeGreaterThanOrEqual(PASS_THRESHOLD);
  });

  it('clamps out-of-range and non-numeric input', () => {
    expect(outcomeFromReviewQuality(-5)).toBe(0);
    expect(outcomeFromReviewQuality(99)).toBe(1);
    expect(outcomeFromReviewQuality(2.7)).toBe(0.8);
    expect(outcomeFromReviewQuality(Number.NaN)).toBe(0);
  });
});

describe('applyEvidence — first evidence', () => {
  it('schedules a correct answer for review a day later', () => {
    const state = applyEvidence(initialMasteryState(), pass());
    expect(state.stability).toBe(1);
    expect(state.dueAt).toBe(at(1));
    expect(state.lastSeenAt).toBe(at(0));
    expect(state.evidenceCount).toBe(1);
  });

  it('schedules a wrong answer for review within the day', () => {
    const state = applyEvidence(initialMasteryState(), fail());
    expect(state.stability).toBeLessThan(1);
    expect(state.strength).toBe(0);
  });

  it('does not jump straight to full strength on one correct answer', () => {
    const state = applyEvidence(initialMasteryState(), pass());
    expect(state.strength).toBeCloseTo(0.5, 5);
  });
});

describe('applyEvidence — stability', () => {
  it('grows on each successful recall', () => {
    let state = applyEvidence(initialMasteryState(), pass(0));
    const first = state.stability;
    state = applyEvidence(state, pass(1));
    const second = state.stability;
    state = applyEvidence(state, pass(4));

    expect(second).toBeGreaterThan(first);
    expect(state.stability).toBeGreaterThan(second);
  });

  it('grows more when the item was nearly forgotten (spacing effect)', () => {
    const base = applyEvidence(initialMasteryState(), pass(0));
    const drilledImmediately = applyEvidence(base, pass(0));
    const recalledMuchLater = applyEvidence(base, pass(30));

    expect(recalledMuchLater.stability).toBeGreaterThan(drilledImmediately.stability);
  });

  it('contracts sharply on a lapse', () => {
    let state = initialMasteryState();
    for (const day of [0, 1, 4, 12]) state = applyEvidence(state, pass(day));
    const beforeLapse = state.stability;

    state = applyEvidence(state, fail(20));
    expect(state.stability).toBeLessThan(beforeLapse * 0.5);
  });

  it('costs less for a near-miss than for a blank', () => {
    let state = initialMasteryState();
    for (const day of [0, 1, 4]) state = applyEvidence(state, pass(day));

    const nearMiss = applyEvidence(state, { outcome: 0.55, at: at(8) });
    const blank = applyEvidence(state, { outcome: 0, at: at(8) });
    expect(nearMiss.stability).toBeGreaterThan(blank.stability);
  });

  it('never falls below the floor or exceeds the ceiling', () => {
    let failing = initialMasteryState();
    for (let day = 0; day < 20; day += 1) failing = applyEvidence(failing, fail(day));
    expect(failing.stability).toBeGreaterThanOrEqual(MIN_STABILITY_DAYS);

    let passing = initialMasteryState();
    for (let i = 0; i < 40; i += 1) passing = applyEvidence(passing, pass(i * 30));
    expect(passing.stability).toBeLessThanOrEqual(MAX_STABILITY_DAYS);
  });
});

describe('applyEvidence — weight', () => {
  it('lets a mock move strength further than a self-rating', () => {
    const base = initialMasteryState();
    const fromMock = applyEvidence(base, { outcome: 1, weight: EVIDENCE_WEIGHTS.mock, at: at(0) });
    const fromSelfRating = applyEvidence(base, {
      outcome: 1,
      weight: EVIDENCE_WEIGHTS.self_rating,
      at: at(0),
    });

    expect(fromMock.strength).toBeGreaterThan(fromSelfRating.strength);
    expect(fromMock.confidence).toBeGreaterThan(fromSelfRating.confidence);
  });

  it('defaults to a weight of 1 when none is given', () => {
    const explicit = applyEvidence(initialMasteryState(), { outcome: 1, weight: 1, at: at(0) });
    const implied = applyEvidence(initialMasteryState(), { outcome: 1, at: at(0) });
    expect(implied.strength).toBe(explicit.strength);
    expect(implied.confidence).toBe(explicit.confidence);
  });
});

describe('applyEvidence — confidence', () => {
  it('rises with every piece of evidence and never exceeds 1', () => {
    let state = initialMasteryState();
    let previous = 0;
    for (let day = 0; day < 30; day += 1) {
      state = applyEvidence(state, pass(day));
      expect(state.confidence).toBeGreaterThan(previous);
      previous = state.confidence;
    }
    expect(state.confidence).toBeLessThanOrEqual(1);
    expect(state.confidence).toBeGreaterThan(0.99);
  });

  it('accumulates independently of how the weight is split up', () => {
    // Four unit-weight events and one weight-4 event carry the same information.
    let split = initialMasteryState();
    for (let day = 0; day < 4; day += 1) split = applyEvidence(split, pass(day));
    const single = applyEvidence(initialMasteryState(), pass(0, CONFIDENCE_SCALE));

    expect(split.confidence).toBeCloseTo(single.confidence, 10);
  });

  it('does not fall when the answer is wrong — a lapse is still evidence', () => {
    const passed = applyEvidence(initialMasteryState(), pass(0));
    const thenFailed = applyEvidence(passed, fail(3));
    expect(thenFailed.confidence).toBeGreaterThan(passed.confidence);
  });
});

describe('retrievabilityAt', () => {
  const state: MasteryState = {
    strength: 0.8,
    stability: 10,
    confidence: 0.9,
    evidenceCount: 5,
    lastSeenAt: at(0),
    dueAt: at(10),
  };

  it('is untouched at the moment of review', () => {
    expect(retrievabilityAt(state, at(0))).toBeCloseTo(0.8, 10);
  });

  it('has decayed to the target retention after exactly one stability period', () => {
    expect(retrievabilityAt(state, at(10))).toBeCloseTo(0.8 * TARGET_RETENTION, 10);
  });

  it('keeps decaying beyond the due date', () => {
    expect(retrievabilityAt(state, at(60))).toBeLessThan(retrievabilityAt(state, at(30)));
  });

  it('never reads as stronger than it was left', () => {
    expect(retrievabilityAt(state, at(-5))).toBeLessThanOrEqual(0.8);
  });

  it('is zero for an objective with no evidence', () => {
    expect(retrievabilityAt(initialMasteryState(), at(30))).toBe(0);
  });
});

describe('masteryBand', () => {
  it('is unknown before any evidence exists', () => {
    expect(masteryBand(initialMasteryState(), at(0))).toBe('unknown');
  });

  it('stays unknown after a single correct answer', () => {
    // The rule that keeps the knowledge graph honest: one data point is not a
    // claim about what a student knows, however good the answer was.
    const state = applyEvidence(initialMasteryState(), pass(0));
    expect(state.confidence).toBeLessThan(MIN_CONFIDENCE_TO_DISPLAY);
    expect(masteryBand(state, at(0))).toBe('unknown');
  });

  it('reports weakness once enough evidence has accumulated', () => {
    let state = initialMasteryState();
    for (let day = 0; day < 6; day += 1) state = applyEvidence(state, fail(day));
    expect(masteryBand(state, at(6))).toBe('weak');
  });

  it('climbs to mastered under sustained correct recall', () => {
    let state = initialMasteryState();
    for (let i = 0; i < 8; i += 1) state = applyEvidence(state, pass(i * 2));
    expect(masteryBand(state, at(14))).toBe('mastered');
  });

  it('decays back down when an objective is left alone', () => {
    let state = initialMasteryState();
    for (let i = 0; i < 5; i += 1) state = applyEvidence(state, pass(i));
    expect(masteryBand(state, at(4))).toBe('mastered');
    expect(masteryBand(state, at(400))).toBe('weak');
  });
});

describe('isDue', () => {
  it('treats a never-studied objective as due', () => {
    expect(isDue(initialMasteryState(), at(0))).toBe(true);
  });

  it('is not due before the scheduled date', () => {
    const state = applyEvidence(initialMasteryState(), pass(0));
    expect(isDue(state, at(0.5))).toBe(false);
  });

  it('is due on and after the scheduled date', () => {
    const state = applyEvidence(initialMasteryState(), pass(0));
    expect(isDue(state, at(1))).toBe(true);
    expect(isDue(state, at(9))).toBe(true);
  });
});

describe('masteryFromEvents', () => {
  it('replays evidence in date order regardless of input order', () => {
    const events = [pass(4), pass(0), pass(1)];
    const replayed = masteryFromEvents(events);

    let sequential = initialMasteryState();
    for (const event of [pass(0), pass(1), pass(4)]) sequential = applyEvidence(sequential, event);

    expect(replayed).toEqual(sequential);
  });

  it('returns the initial state for a student with no evidence', () => {
    expect(masteryFromEvents([])).toEqual(initialMasteryState());
  });

  it('reproduces a state built incrementally — student_subtopic_mastery is derivable', () => {
    const events = [pass(0), fail(2), pass(3, 1.5), pass(9), fail(20), pass(24)];
    let incremental = initialMasteryState();
    for (const event of events) incremental = applyEvidence(incremental, event);

    expect(masteryFromEvents(events)).toEqual(incremental);
  });
});

describe('robustness', () => {
  it('treats a non-numeric outcome as a failure rather than producing NaN', () => {
    const state = applyEvidence(initialMasteryState(), {
      outcome: Number.NaN,
      at: at(0),
    });
    expect(Number.isFinite(state.strength)).toBe(true);
    expect(state.strength).toBe(0);
  });

  it('recovers from a corrupt stored state', () => {
    const corrupt = {
      strength: Number.NaN,
      stability: -5,
      confidence: Number.NaN,
      evidenceCount: -3,
      lastSeenAt: 'not-a-date',
      dueAt: null,
    } as unknown as MasteryState;

    const state = applyEvidence(corrupt, pass(0));
    expect(state.strength).toBeGreaterThanOrEqual(0);
    expect(state.stability).toBeGreaterThanOrEqual(MIN_STABILITY_DAYS);
    expect(state.evidenceCount).toBe(1);
  });

  it('clamps an out-of-range outcome', () => {
    const state = applyEvidence(initialMasteryState(), { outcome: 42, at: at(0) });
    expect(state.strength).toBeLessThanOrEqual(1);
  });
});
