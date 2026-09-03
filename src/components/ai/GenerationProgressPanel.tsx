'use client';

import { Check, Loader2 } from 'lucide-react';
import {
  DEFAULT_STAGE_LABELS,
  STAGE_ORDER,
  formatDuration,
  type GenerationJobStatus,
} from '@/lib/ai/generationProgress';

interface GenerationProgressPanelProps {
  status: GenerationJobStatus;
  elapsedMs: number;
  /** 0-1, already bounded by the stage the server last reported. */
  progress: number;
  remainingMs: number;
  overrunningStage: boolean;
  /** Overrides for stage wording; only `saving` differs between the two flows. */
  labels?: Partial<Record<GenerationJobStatus, string>>;
  /** What the user may safely do while this runs. Differs by flow, so required. */
  footer: string;
  className?: string;
}

/**
 * The staged progress display for a background generation run.
 *
 * Every number it shows traces to a real signal: the stage came from the job
 * row, the elapsed clock from when the run started, and the bar's position from
 * how far into the current stage's measured budget it is. Nothing advances on a
 * fixed timer, and the bar cannot enter a stage the server has not reported.
 */
export function GenerationProgressPanel({
  status,
  elapsedMs,
  progress,
  remainingMs,
  overrunningStage,
  labels,
  footer,
  className = '',
}: GenerationProgressPanelProps) {
  const stageLabel = { ...DEFAULT_STAGE_LABELS, ...labels };
  const currentIndex = STAGE_ORDER.indexOf(status);

  return (
    <div className={`rounded-xl border border-subtle bg-surface-sunken p-4 dark:bg-surface/3 ${className}`}>
      <div className="flex items-center gap-2">
        {status === 'completed' ? (
          <Check className="h-4 w-4 text-emerald-500" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
        )}
        <p role="status" aria-live="polite" className="text-sm font-medium text-content">
          {stageLabel[status]}
        </p>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-linear"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-content-subtle">
        {formatDuration(elapsedMs)} elapsed ·{' '}
        {status === 'completed'
          ? 'done'
          : overrunningStage
            ? 'this step is taking longer than usual'
            : `about ${formatDuration(remainingMs)} left`}
      </p>

      <ol className="mt-3 space-y-1.5">
        {STAGE_ORDER.map((stage, index) => {
          // A stage can be skipped (backfill only runs on a short first pass),
          // so "done" is by position rather than by having been seen.
          const done = currentIndex > index;
          const active = currentIndex === index;
          return (
            <li
              key={stage}
              className={`flex items-center gap-2 text-xs ${
                active ? 'font-semibold text-content' : done ? 'text-content-muted' : 'text-content-subtle'
              }`}
            >
              {done ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-accent' : 'bg-slate-300 dark:bg-white/20'}`} />
              )}
              {stageLabel[stage]}
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-xs text-content-subtle">{footer}</p>
    </div>
  );
}
