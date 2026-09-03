'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import {
  JOB_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  STALE_AFTER_MS,
  TICK_MS,
  deriveProgress,
  estimateDurationMs,
  type CompletedRun,
  type GenerationJobStatus,
} from '@/lib/ai/generationProgress';

/** The columns every generation job row must expose for tracking to work. */
export type GenerationJobRow = {
  id: string;
  status: GenerationJobStatus;
  error: string | null;
  updated_at: string;
};

export const STALE_JOB_ERROR =
  'Generation stopped partway through and did not finish. Nothing was saved — please try again.';

/**
 * Track a background generation job and derive an honest progress display from
 * it: which stage the server last reported, how long ago it reported it, and
 * how long this user's finished runs have actually taken.
 *
 * Shared by the teacher assignment form and the student practice generator,
 * which poll different tables but run the identical pipeline behind them.
 */
export function useGenerationJob<Row extends GenerationJobRow>({
  table,
  columns,
}: {
  /** Job table to poll. RLS scopes every read here to the current user. */
  table: string;
  /** Columns to select, including at least those in `GenerationJobRow`. */
  columns: string;
}) {
  const supabase = createClient();
  const [status, setStatus] = useState<GenerationJobStatus | null>(null);
  // Three separate clocks, all real: when the run started, when the current
  // stage started, and now. Nothing here advances on its own -- stageStartedAt
  // only moves when the server reports a new stage.
  const [startedAt, setStartedAt] = useState(0);
  const [stageStartedAt, setStageStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [estimateMs, setEstimateMs] = useState(() => estimateDurationMs([], 1));

  // The clock the panel reads. Only runs while a job is being tracked.
  const isTracking = status !== null;
  useEffect(() => {
    if (!isTracking) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [isTracking]);

  /**
   * Record a stage the server has reported, restarting the within-stage creep
   * on a transition and only on a transition -- a poll that sees the same stage
   * again must not rewind it.
   */
  const lastStageRef = useRef<GenerationJobStatus | null>(null);
  const applyStage = useCallback((next: GenerationJobStatus) => {
    if (lastStageRef.current !== next) {
      lastStageRef.current = next;
      setStageStartedAt(Date.now());
    }
    setStatus(next);
  }, []);

  const fetchEstimate = useCallback(
    async (questionCount: number) => {
      const { data } = await supabase
        .from(table)
        .select('created_at, updated_at, question_count')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(10);
      return estimateDurationMs((data ?? []) as CompletedRun[], questionCount);
    },
    [supabase, table]
  );

  /**
   * Start showing progress. Call before the request that creates the job, so the
   * panel is up while that request is in flight.
   *
   * `startedAtMs` exists for resuming a run that began before this page was
   * mounted -- passing when it actually started keeps the elapsed clock honest
   * instead of restarting it from zero.
   */
  const begin = useCallback(
    ({ questionCount, startedAt: startedAtMs = Date.now() }: { questionCount: number; startedAt?: number }) => {
      const nowMs = Date.now();
      lastStageRef.current = 'queued';
      setStartedAt(Math.min(startedAtMs, nowMs));
      setStageStartedAt(nowMs);
      setNow(nowMs);
      // Size-only estimate until history arrives, so the first paint is already
      // scaled to what was asked for rather than to whatever ran last.
      setEstimateMs(estimateDurationMs([], questionCount));
      setStatus('queued');
      // Runs alongside the caller's request rather than before it, so pacing the
      // display never delays the work it is pacing.
      void fetchEstimate(questionCount).then(setEstimateMs, () => {});
    },
    [fetchEstimate]
  );

  /**
   * Poll the job row until it settles. Returns null on timeout, which is not the
   * same as failure — the job is still running server-side.
   */
  const track = useCallback(
    async (jobId: string): Promise<Row | null> => {
      const deadline = Date.now() + JOB_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const { data } = await supabase.from(table).select(columns).eq('id', jobId).maybeSingle();
        const row = data as Row | null;
        if (row) {
          applyStage(row.status);
          if (row.status === 'completed' || row.status === 'failed') return row;

          // Nothing is left running to mark this failed, so say so rather than
          // spinning until the timeout and implying it is still going.
          const sinceUpdate = Date.now() - new Date(row.updated_at).getTime();
          if (Number.isFinite(sinceUpdate) && sinceUpdate > STALE_AFTER_MS) {
            return { ...row, status: 'failed', error: STALE_JOB_ERROR };
          }
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      return null;
    },
    [supabase, table, columns, applyStage]
  );

  const reset = useCallback(() => {
    lastStageRef.current = null;
    setStatus(null);
  }, []);

  const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0;
  const stageElapsedMs = stageStartedAt ? Math.max(0, now - stageStartedAt) : 0;
  const { progress, remainingMs, overrunningStage } = deriveProgress({ status, estimateMs, stageElapsedMs });

  return { status, elapsedMs, progress, remainingMs, overrunningStage, begin, track, reset };
}
