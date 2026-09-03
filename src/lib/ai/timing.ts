/**
 * Stage timing for the long AI routes.
 *
 * Marking and generation are 45-75 second operations and nobody could say which
 * part was slow: the model call, the curriculum reads, the attempt write, or our
 * own JSON coercion. Every stage is recorded and emitted as a single structured
 * line so a slow run can be attributed from the server log alone, before anyone
 * changes a model or restructures a call.
 *
 * Deliberately console-only: this is diagnosis, not a metrics pipeline, and it
 * must not add a network hop to the very path it is measuring.
 */

export interface StageTimer {
  /**
   * Time an awaited step and record how long it took. Takes a `PromiseLike`
   * because Supabase query builders are thenable but are not `Promise`s.
   */
  step<T>(stage: string, fn: () => PromiseLike<T>): Promise<T>;
  /** Record a stage whose duration was measured elsewhere. */
  record(stage: string, ms: number): void;
  /** Emit the collected timings as one line. Safe to call more than once. */
  done(extra?: Record<string, unknown>): void;
}

export function createStageTimer(label: string): StageTimer {
  const start = Date.now();
  const stages: Record<string, number> = {};

  return {
    async step<T>(stage: string, fn: () => PromiseLike<T>): Promise<T> {
      const began = Date.now();
      try {
        return await fn();
      } finally {
        // Recorded in `finally` so a stage that throws still shows how long it
        // burned before failing -- an AI timeout is exactly the case worth
        // measuring, and it is the one that never reaches `done()` normally.
        stages[stage] = (stages[stage] ?? 0) + (Date.now() - began);
      }
    },
    record(stage: string, ms: number) {
      stages[stage] = (stages[stage] ?? 0) + ms;
    },
    done(extra?: Record<string, unknown>) {
      const totalMs = Date.now() - start;
      // Whatever is not inside a named stage is our own synchronous work --
      // parsing, coercion, normalisation. Naming it stops it hiding in the gap
      // between the sum of the stages and the total.
      const measured = Object.values(stages).reduce((sum, ms) => sum + ms, 0);
      console.log(
        `[${label}] timings`,
        JSON.stringify({ totalMs, ...stages, otherMs: Math.max(0, totalMs - measured), ...extra })
      );
    },
  };
}
