import type { MasteryBand } from './mastery';

/**
 * Shared colour coding for mastery bands — the band-valued sibling of
 * scoreTone.ts.
 *
 * Kept separate rather than mapping bands onto scoreTone: masteryBand breaks at
 * retrievabilities of 0.85/0.65/0.40 while scoreTone breaks at 70/40, so
 * reusing it would paint a 'secure' subtopic amber.
 *
 * 'unknown' is grey, never red. A subtopic nobody has enough evidence on must
 * look untested rather than weak — that rule is the whole reason the model
 * tracks confidence separately from strength.
 */

export const MASTERY_LABEL: Record<MasteryBand, string> = {
  unknown: 'Not measured',
  weak: 'Weak',
  developing: 'Developing',
  secure: 'Secure',
  mastered: 'Mastered',
};

export function masteryBadgeTone(band: MasteryBand): string {
  switch (band) {
    case 'mastered':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';
    case 'secure':
      return 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300';
    case 'developing':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
    case 'weak':
      return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300';
    default:
      return 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400';
  }
}

export function masteryBarTone(band: MasteryBand): string {
  switch (band) {
    case 'mastered':
      return 'bg-emerald-500';
    case 'secure':
      return 'bg-teal-500';
    case 'developing':
      return 'bg-amber-500';
    case 'weak':
      return 'bg-red-500';
    default:
      return 'bg-slate-300 dark:bg-white/20';
  }
}
