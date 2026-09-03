import { describe, expect, it } from 'vitest';
import {
  STAGE_BOUNDS,
  STAGE_ORDER,
  deriveProgress,
  estimateDurationMs,
  formatDuration,
  stageIndex,
} from './generationProgress';

const ESTIMATE = 90_000;

describe('deriveProgress', () => {
  it('never crosses into the next stage, however long the current one runs', () => {
    // The whole point of the bounds: only the server reporting a new stage may
    // move the bar past the current stage's ceiling.
    const [, ceiling] = STAGE_BOUNDS.generating;
    for (const stageElapsedMs of [0, 30_000, 61_200, 120_000, 10 * 60_000]) {
      const { progress } = deriveProgress({ status: 'generating', estimateMs: ESTIMATE, stageElapsedMs });
      expect(progress).toBeLessThanOrEqual(ceiling);
    }
  });

  it('starts each stage at its floor and creeps towards the ceiling', () => {
    const [floor, ceiling] = STAGE_BOUNDS.generating;
    const atStart = deriveProgress({ status: 'generating', estimateMs: ESTIMATE, stageElapsedMs: 0 });
    expect(atStart.progress).toBe(floor);

    // Half of this stage's budget (90s * 0.68 = 61.2s) puts it halfway across.
    const halfway = deriveProgress({ status: 'generating', estimateMs: ESTIMATE, stageElapsedMs: 30_600 });
    expect(halfway.progress).toBeCloseTo(floor + (ceiling - floor) / 2, 5);
  });

  it('reports a stage that has outlived its share of the estimate', () => {
    const within = deriveProgress({ status: 'generating', estimateMs: ESTIMATE, stageElapsedMs: 30_000 });
    expect(within.overrunningStage).toBe(false);

    const beyond = deriveProgress({ status: 'generating', estimateMs: ESTIMATE, stageElapsedMs: 62_000 });
    expect(beyond.overrunningStage).toBe(true);
    // Overrunning pins the bar rather than pushing it forward.
    expect(beyond.progress).toBe(STAGE_BOUNDS.generating[1]);
  });

  it('never runs the countdown below zero', () => {
    const { remainingMs } = deriveProgress({ status: 'saving', estimateMs: ESTIMATE, stageElapsedMs: 10 * 60_000 });
    expect(remainingMs).toBeGreaterThanOrEqual(0);
  });

  it('scales the creep to the estimate rather than to wall-clock time', () => {
    // The same 30s into `generating` is further through a 60s run than a 180s one.
    const fast = deriveProgress({ status: 'generating', estimateMs: 60_000, stageElapsedMs: 30_000 });
    const slow = deriveProgress({ status: 'generating', estimateMs: 180_000, stageElapsedMs: 30_000 });
    expect(fast.progress).toBeGreaterThan(slow.progress);
  });

  it('is complete at completed and empty before a job starts', () => {
    expect(deriveProgress({ status: 'completed', estimateMs: ESTIMATE, stageElapsedMs: 0 }).progress).toBe(1);
    expect(deriveProgress({ status: null, estimateMs: ESTIMATE, stageElapsedMs: 0 }).progress).toBe(0);
  });

  it('keeps the stage bands in checklist order and contiguous', () => {
    // A gap or an overlap would let the bar jump backwards on a real stage change.
    for (let i = 1; i < STAGE_ORDER.length; i += 1) {
      expect(STAGE_BOUNDS[STAGE_ORDER[i]][0]).toBe(STAGE_BOUNDS[STAGE_ORDER[i - 1]][1]);
    }
  });
});

describe('stageIndex', () => {
  it('ticks every stage once the job completes', () => {
    // The sub-second tail (finalising, saving) is usually never sampled by the
    // poll, so completion has to tick what it jumped over rather than leaving
    // the checklist looking like the run skipped those steps.
    const index = stageIndex('completed');
    for (let i = 0; i < STAGE_ORDER.length; i += 1) {
      expect(index > i).toBe(true);
    }
  });

  it('ticks the stages already passed and marks the current one active', () => {
    const index = stageIndex('generating');
    expect(index > STAGE_ORDER.indexOf('validating')).toBe(true);
    expect(index === STAGE_ORDER.indexOf('generating')).toBe(true);
    expect(index > STAGE_ORDER.indexOf('finalising')).toBe(false);
  });

  it('claims nothing about how far a failed run got', () => {
    expect(stageIndex('failed')).toBe(-1);
  });
});

describe('estimateDurationMs', () => {
  const base = Date.parse('2026-09-03T10:00:00.000Z');
  const run = (ms: number, questionCount: number | null) => ({
    created_at: new Date(base).toISOString(),
    updated_at: new Date(base + ms).toISOString(),
    question_count: questionCount,
  });

  it('scales with question count when there is no history', () => {
    const one = estimateDurationMs([], 1);
    const six = estimateDurationMs([], 6);
    expect(six).toBeGreaterThan(one);
    // Not proportional: a fixed cost is paid whatever the size.
    expect(six).toBeLessThan(one * 6);
  });

  it('does not quote a small run the time a large one took', () => {
    // The reported bug: after a 6-question run at 71s, a 1-question run was
    // told to expect 71s.
    const estimate = estimateDurationMs([run(71_000, 6)], 1);
    expect(estimate).toBeLessThan(30_000);
  });

  it('does not quote a large run the time a small one took', () => {
    // ...and the inverse, which is the more damaging direction: a 6-question
    // run was told to expect the 15s its 1-question predecessor took.
    const estimate = estimateDurationMs([run(15_000, 1)], 6);
    expect(estimate).toBeGreaterThan(45_000);
  });

  it('prefers runs of exactly the size being asked for', () => {
    // The 6-question runs are present and much slower, but irrelevant here.
    const rows = [run(70_000, 6), run(14_000, 1), run(72_000, 6), run(16_000, 1)];
    expect(estimateDurationMs(rows, 1)).toBe(16_000);
  });

  it('ignores rows written before question_count existed', () => {
    // Unsized rows can be neither matched nor scaled, so a sized row wins even
    // when the unsized ones are more recent.
    const rows = [run(300_000, null), run(60_000, 3)];
    expect(estimateDurationMs(rows, 3)).toBe(60_000);
  });

  it('falls back to the size model when every row is unusable', () => {
    // 2s is too short to be a real generation; null carries no size.
    expect(estimateDurationMs([run(2_000, 6), run(60_000, null)], 6)).toBe(estimateDurationMs([], 6));
  });

  it('takes the median so one outlier cannot stretch the estimate', () => {
    const rows = [run(60_000, 6), run(70_000, 6), run(280_000, 6)];
    expect(estimateDurationMs(rows, 6)).toBe(70_000);
  });
});

describe('formatDuration', () => {
  it('reads as seconds under a minute and pads seconds past it', () => {
    expect(formatDuration(42_000)).toBe('42s');
    expect(formatDuration(65_000)).toBe('1m 05s');
    expect(formatDuration(-5)).toBe('0s');
  });
});
