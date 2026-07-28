/**
 * Leech detection.
 *
 * A "leech" (Anki's term) is a card you keep getting wrong — it has lapsed
 * many times relative to how often you've passed it, so it drains review time.
 * Lapses come from the lifetime tallies: lapses = times_studied − times_correct.
 *
 * These are the only counters that persist across a lapse. The previous proxy
 * (repetition_count − consecutive_correct) could never reach the threshold,
 * because a lapse zeroes both counters together — so no card was ever flagged.
 *
 * Surfacing leeches lets the student attack their stickiest cards first instead
 * of grinding the same failures on every review.
 */

export interface LeechStats {
  times_studied?: number | null;
  times_correct?: number | null;
}

/** Default lapse threshold at which a card is considered a leech. */
export const LEECH_THRESHOLD = 8;

/** Number of times a card has been failed across its whole review history. */
export function lapseCount(card: LeechStats): number {
  const studied = Math.max(0, card.times_studied || 0);
  const correct = Math.min(Math.max(0, card.times_correct || 0), studied);
  return studied - correct;
}

export function isLeech(card: LeechStats, threshold: number = LEECH_THRESHOLD): boolean {
  return lapseCount(card) >= threshold;
}

/** Count leeches in a set of cards. */
export function countLeeches(cards: LeechStats[], threshold: number = LEECH_THRESHOLD): number {
  return cards.reduce((n, card) => (isLeech(card, threshold) ? n + 1 : n), 0);
}
