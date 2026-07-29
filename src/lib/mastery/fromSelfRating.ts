/**
 * Red/amber/green self-rating as Learning Spine evidence.
 *
 * Self-rating is the cheapest evidence the app can collect — one click, no model
 * call — and the least trustworthy, which is why EVIDENCE_WEIGHTS.self_rating is
 * 0.2 against exam_practice's 1.2. That asymmetry is also what makes it the one
 * source a student can farm: the rating is, by definition, whatever they say it
 * is, so nothing but a rate limit stands between twenty clicks on green and a
 * subtopic the planner believes is secure.
 *
 * Hence the split below. The *label* on student_subtopic_mastery.self_rating
 * always reflects the latest click — it is self-reported and displayed as such.
 * The *evidence* is emitted only when the rating carries new information.
 */

export type SelfRating = 'red' | 'amber' | 'green';

export const SELF_RATINGS: SelfRating[] = ['red', 'amber', 'green'];

export const isSelfRating = (value: unknown): value is SelfRating =>
  typeof value === 'string' && (SELF_RATINGS as string[]).includes(value);

/** Minimum gap between two events for the same unchanged rating. */
export const SELF_RATING_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Whether this click should emit a `self_rating` mastery event.
 *
 * A changed rating is always new information — a student moving amber to red has
 * told us something, and making them wait a day to say it would lose it. An
 * unchanged rating is a re-assertion, worth recording once a day at most: that is
 * still enough for a student who genuinely revisits a subtopic to accumulate
 * evidence over a revision period, while capping what a single sitting can forge.
 */
export function shouldEmitSelfRatingEvent(
  previousRating: SelfRating | null,
  nextRating: SelfRating,
  lastEventAt: string | null,
  now: Date = new Date()
): boolean {
  if (previousRating !== nextRating) return true;
  if (!lastEventAt) return true;

  const last = new Date(lastEventAt).getTime();
  if (!Number.isFinite(last)) return true;

  return now.getTime() - last >= SELF_RATING_COOLDOWN_MS;
}
