/**
 * Shared progress model for the long AI generation runs.
 *
 * Two flows report progress from the same pipeline -- teacher assignment
 * generation (`/api/assignments/generate`) and student practice generation
 * (`/api/questions/generate`) -- and both write their stage onto a job row that
 * the browser polls. This module holds the part that is neither React nor
 * Supabase: the stage vocabulary, the bounds the progress bar must respect, and
 * the arithmetic that turns "which stage, for how long" into a bar width.
 *
 * Kept pure so the one rule that matters can be pinned by tests: the bar is
 * allowed to guess *within* the stage the server last reported, and is never
 * allowed to guess its way into the next one.
 */

export type GenerationJobStatus =
  | 'queued'
  | 'validating'
  | 'generating'
  | 'backfilling'
  | 'finalising'
  | 'saving'
  | 'completed'
  | 'failed';

/** The stages shown as a checklist, in order. Terminal states are not listed. */
export const STAGE_ORDER: GenerationJobStatus[] = [
  'queued',
  'validating',
  'generating',
  'backfilling',
  'finalising',
  'saving',
];

/**
 * Labels shared by both flows. The `saving` step differs -- one saves an
 * assignment, the other a practice set -- so callers override that one.
 */
export const DEFAULT_STAGE_LABELS: Record<GenerationJobStatus, string> = {
  queued: 'Starting up',
  validating: 'Checking the topic against the specification',
  generating: 'Writing questions',
  backfilling: 'Filling gaps in the question set',
  finalising: 'Checking the question set over',
  saving: 'Saving',
  completed: 'Done',
  failed: 'Failed',
};

/**
 * How far through the run each stage is allowed to place the progress bar.
 *
 * These are *bounds*, not a schedule. Within a stage the bar creeps from the
 * lower bound towards the upper one on measured elapsed time, but it can never
 * cross into the next stage's band until the server actually reports having got
 * there -- so the bar can be optimistic about the stage it is on and can never
 * be wrong about which stage that is. `generating` owns the bulk of it because
 * the model call is the bulk of the run (~74s of a ~90s job).
 */
export const STAGE_BOUNDS: Record<GenerationJobStatus, [number, number]> = {
  queued: [0, 0.04],
  validating: [0.04, 0.14],
  generating: [0.14, 0.82],
  backfilling: [0.82, 0.9],
  finalising: [0.9, 0.95],
  saving: [0.95, 0.99],
  completed: [1, 1],
  failed: [0, 0],
};

/** Backfill only runs when the first pass came up short, so it may be skipped. */
export const POLL_INTERVAL_MS = 1500;
/** Generous: generation has been measured at ~74s and can retry internally. */
export const JOB_TIMEOUT_MS = 5 * 60 * 1000;
/**
 * A job whose stage has not moved in this long is treated as dead.
 *
 * Generation runs inside the request's own invocation (`after()`), so if the
 * platform terminates that invocation — the routes are pinned at Vercel's 300s
 * ceiling, with no headroom — nothing is left to write `failed` and the row sits
 * in `generating` forever. Without this the user watches a spinner for the full
 * five minutes and is then told, wrongly, that it is still running.
 *
 * Comfortably longer than the slowest single stage: generation itself is the
 * long one at ~74s, and it updates the row on entry and exit.
 */
export const STALE_AFTER_MS = 3 * 60 * 1000;
/**
 * Used only until this user has finished a job we can measure. Every later run
 * is paced by their own history instead -- a subject that makes the model slow
 * should not be told the same number as one where it is fast.
 */
export const FALLBACK_ESTIMATE_MS = 90 * 1000;
/** Redraw cadence for the elapsed clock and the within-stage creep. */
export const TICK_MS = 500;
/**
 * Runs faster than this are not generation finishing early, they are a job that
 * failed its way to a terminal state, and letting one into the median would
 * shorten every later estimate.
 */
const MIN_CREDIBLE_RUN_MS = 5000;

export const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
};

/**
 * How long this user's generations actually take, from their own finished jobs.
 * The median rather than the mean, so one five-minute outlier does not stretch
 * every later estimate.
 */
export function medianDurationMs(rows: { created_at: string; updated_at: string }[]): number {
  const durations = rows
    .map((row) => new Date(row.updated_at).getTime() - new Date(row.created_at).getTime())
    .filter((ms) => Number.isFinite(ms) && ms > MIN_CREDIBLE_RUN_MS && ms < JOB_TIMEOUT_MS)
    .sort((a, b) => a - b);
  return durations.length === 0 ? FALLBACK_ESTIMATE_MS : durations[Math.floor(durations.length / 2)];
}

/**
 * Turn "which stage, and how long it has been on it" into a bar width and a
 * countdown. `stageElapsedMs` is measured from when the *browser observed* the
 * stage change rather than from the row's `updated_at`, so a browser clock that
 * disagrees with the server's cannot produce a negative or runaway elapsed time.
 */
export function deriveProgress(input: {
  status: GenerationJobStatus | null;
  estimateMs: number;
  stageElapsedMs: number;
}): { progress: number; remainingMs: number; overrunningStage: boolean } {
  const { status, estimateMs, stageElapsedMs } = input;
  if (!status) return { progress: 0, remainingMs: estimateMs, overrunningStage: false };

  const [floor, ceiling] = STAGE_BOUNDS[status];
  const span = ceiling - floor;
  // Terminal states have no width to creep across.
  if (span <= 0) {
    return { progress: floor, remainingMs: Math.max(0, estimateMs * (1 - floor)), overrunningStage: false };
  }

  // The share of the run this stage should occupy, expressed as a duration, so
  // a longer estimate makes the bar creep more slowly rather than hitting the
  // stage ceiling early and sitting there.
  const budgetMs = Math.max(1, estimateMs * span);
  const progress = floor + span * Math.min(1, Math.max(0, stageElapsedMs) / budgetMs);
  return {
    progress,
    remainingMs: Math.max(0, estimateMs * (1 - progress)),
    overrunningStage: stageElapsedMs > budgetMs,
  };
}
