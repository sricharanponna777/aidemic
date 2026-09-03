import { describe, expect, it } from 'vitest';
import {
  FALLBACK_ESTIMATE_MS,
  STAGE_BOUNDS,
  STAGE_ORDER,
  deriveProgress,
  formatDuration,
  medianDurationMs,
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

describe('medianDurationMs', () => {
  const run = (ms: number) => ({ created_at: '2026-09-03T10:00:00.000Z', updated_at: new Date(Date.parse('2026-09-03T10:00:00.000Z') + ms).toISOString() });

  it('falls back until there is a finished run to measure', () => {
    expect(medianDurationMs([])).toBe(FALLBACK_ESTIMATE_MS);
  });

  it('takes the median so a single outlier cannot stretch the estimate', () => {
    expect(medianDurationMs([run(60_000), run(70_000), run(280_000)])).toBe(70_000);
  });

  it('discards runs too short to be a real generation', () => {
    // A job that failed its way to a terminal state in 2s is not evidence.
    expect(medianDurationMs([run(2_000)])).toBe(FALLBACK_ESTIMATE_MS);
  });
});

describe('formatDuration', () => {
  it('reads as seconds under a minute and pads seconds past it', () => {
    expect(formatDuration(42_000)).toBe('42s');
    expect(formatDuration(65_000)).toBe('1m 05s');
    expect(formatDuration(-5)).toBe('0s');
  });
});
