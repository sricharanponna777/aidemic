/** Shared color coding for percentage-based metrics (completion rate, average
 * score) shown across the teacher dashboard and class analytics. */

export function scoreTextTone(pct: number | null): string {
  if (pct === null) return 'text-slate-500 dark:text-slate-400';
  if (pct >= 70) return 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export function scoreBarTone(pct: number | null): string {
  if (pct === null) return 'bg-slate-300 dark:bg-white/20';
  if (pct >= 70) return 'bg-emerald-500';
  if (pct >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

export function scoreBadgeTone(pct: number | null): string {
  if (pct === null) return 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400';
  if (pct >= 70) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';
  if (pct >= 40) return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
  return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300';
}
