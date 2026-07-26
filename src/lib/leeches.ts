/**
 * Leech detection.
 *
 * A "leech" (Anki's term) is a card you keep getting wrong — it has lapsed
 * many times relative to how often you've passed it, so it drains review time.
 * We derive lapses the same way calculateRetentionRate does in
 * spacedRepetition.ts: lapses ≈ repetition_count − consecutive_correct.
 *
 * Surfacing leeches lets the student attack their stickiest cards first instead
 * of grinding the same failures on every review.
 */

export interface LeechStats {
  repetition_count?: number | null;
  consecutive_correct?: number | null;
}

/** Default lapse threshold at which a card is considered a leech. */
export const LEECH_THRESHOLD = 8;

/** Number of times a card has been forgotten after previously being learned. */
export function lapseCount(card: LeechStats): number {
  return Math.max(0, (card.repetition_count || 0) - (card.consecutive_correct || 0));
}

export function isLeech(card: LeechStats, threshold: number = LEECH_THRESHOLD): boolean {
  return lapseCount(card) >= threshold;
}

/** Count leeches in a set of cards. */
export function countLeeches(cards: LeechStats[], threshold: number = LEECH_THRESHOLD): number {
  return cards.reduce((n, card) => (isLeech(card, threshold) ? n + 1 : n), 0);
}
