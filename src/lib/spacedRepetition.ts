// SM-2 spaced repetition algorithm helpers

export interface CardSR {
  ease_factor: number;
  interval_days: number;
  repetition_count: number;
  consecutive_correct: number;
}

/**
 * Update card statistics based on response quality (0-5).
 * Returns new SR fields and next review date.
 */
export function updateSpacedRepetition(
  prev: CardSR & { interval_days: number },
  quality: number
): { ease_factor: number; interval_days: number; next_review_date: string; repetition_count: number; consecutive_correct: number } {
  // ensure quality bounds
  quality = Math.max(0, Math.min(5, quality));
  let { ease_factor, interval_days, repetition_count, consecutive_correct } = prev;

  if (quality < 3) {
    repetition_count = 0;
    consecutive_correct = 0;
    interval_days = 1;
  } else {
    consecutive_correct += 1;
    repetition_count += 1;
    // update ease factor
    ease_factor = Math.max(
      1.3,
      ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );
    if (repetition_count === 1) {
      interval_days = 1;
    } else if (repetition_count === 2) {
      interval_days = 3;
    } else {
      interval_days = Math.round(interval_days * ease_factor);
    }
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval_days);

  return {
    ease_factor,
    interval_days,
    next_review_date: nextReview.toISOString(),
    repetition_count,
    consecutive_correct,
  };
}
