/**
 * One definition of "a card is due", and one cap on how many a single Daily
 * Review session will carry.
 *
 * The predicate was previously written out five times -- the dashboard banner,
 * the Daily Review summary, the Daily Review queue, the study-sessions deck
 * tiles and the two flashcard list pages -- and one of those copies disagreed
 * with the rest about unparseable dates. More importantly the cap lived next to
 * the queue only, so the counters advertised a number the session could not
 * deliver: sixteen cards due produced "Item 1 of 15".
 */

/** A session is a session, not an inbox. Cards beyond this carry to tomorrow. */
export const MAX_DAILY_REVIEW_FLASHCARDS = 15;

export type DueCard = { next_review_date?: string | null };

/**
 * No date, or a date we cannot parse, counts as due.
 *
 * A card with nothing scheduled has never been reviewed, and one with a corrupt
 * timestamp is better shown than silently withheld forever.
 */
export const isCardDue = (nextReviewDate: string | null | undefined, now: Date): boolean => {
  if (!nextReviewDate) return true;
  const nextReview = new Date(nextReviewDate);
  return Number.isNaN(nextReview.getTime()) || nextReview <= now;
};

/** Every due card. Uncapped -- this is the honest "how much is waiting" number. */
export const countDueCards = <T extends DueCard>(cards: readonly T[], now: Date): number =>
  cards.reduce((total, card) => (isCardDue(card.next_review_date, now) ? total + 1 : total), 0);

/** The due cards one session will actually carry. */
export const selectDueCards = <T extends DueCard>(
  cards: readonly T[],
  now: Date,
  limit = MAX_DAILY_REVIEW_FLASHCARDS
): T[] => cards.filter((card) => isCardDue(card.next_review_date, now)).slice(0, limit);
