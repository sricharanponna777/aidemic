// SM-2 spaced repetition algorithm helpers

export interface CardSR {
  ease_factor: number;
  interval_days: number;
  repetition_count: number;
  consecutive_correct: number;
}

/**
 * Update card statistics based on response quality (0-3).
 * Anki-style algorithm:
 * 0: Again - reset to 1 minute
 * 1: Hard - 1.2x previous interval (min 1 day)
 * 2: Good - 2.5x previous interval
 * 3: Easy - 3.33x previous interval
 * Returns new SR fields and next review date.
 */
function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function updateSpacedRepetition(
  prev: CardSR & { interval_days: number },
  quality: number
): { ease_factor: number; interval_days: number; next_review_date: string; repetition_count: number; consecutive_correct: number } {
  quality = Math.max(0, Math.min(3, quality));

  let {
    ease_factor,
    interval_days,
    repetition_count,
    consecutive_correct,
  } = prev;

  if (!ease_factor || ease_factor < 1.3) {
    ease_factor = 2.5;
  }

  const previousInterval = interval_days || 0;

  if (quality === 0) {
    repetition_count = 0;
    consecutive_correct = 0;
    interval_days = 1 / 1440; // 1 minute in days
    ease_factor = Math.max(1.3, ease_factor - 0.2);
  } else if (quality === 1) {
    consecutive_correct = 0;
    if (repetition_count === 0) {
      interval_days = 1; // first hard review -> 1 day
    } else {
      interval_days = Math.max(1, Math.round(previousInterval * 1.2));
    }
  } else {
    repetition_count += 1;
    consecutive_correct += 1;

    if (quality === 3) {
      ease_factor = Math.max(1.3, ease_factor + 0.15);
    }

    if (repetition_count === 1) {
      interval_days = 1 / 144; // 10 minutes for first successful recall
    } else if (repetition_count === 2) {
      interval_days = 1; // 1 day for second successful recall
    } else if (repetition_count === 3) {
      interval_days = 6; // 6 days for third successful recall
    } else {
      interval_days = Math.round(previousInterval * ease_factor);
    }
  }

  return {
    ease_factor,
    interval_days,
    next_review_date: addDays(new Date(), interval_days).toISOString(),
    repetition_count,
    consecutive_correct,
  };
}

/**
 * Calculate next review date for a given quality without updating the card.
 * Used for previewing options.
 */
export function previewNextReview(
  prev: CardSR & { interval_days: number },
  quality: number
): { interval_days: number; next_review_date: string } {
  quality = Math.max(0, Math.min(3, quality));
  let { interval_days, ease_factor } = prev;
  const repetition_count = prev.repetition_count || 0;

  if (!ease_factor || ease_factor < 1.3) {
    ease_factor = 2.5;
  }

  const previousInterval = interval_days || 0;

  if (quality === 0) {
    interval_days = 1 / 1440;
  } else if (quality === 1) {
    interval_days = repetition_count === 0 ? 1 : Math.max(1, Math.round(previousInterval * 1.2));
  } else {
    const nextRep = repetition_count + 1;

    if (quality === 3) {
      ease_factor = Math.max(1.3, ease_factor + 0.15);
    }

    if (nextRep === 1) {
      interval_days = 1 / 144;
    } else if (nextRep === 2) {
      interval_days = 1;
    } else if (nextRep === 3) {
      interval_days = 6;
    } else {
      interval_days = Math.round(previousInterval * ease_factor);
    }
  }

  return {
    interval_days,
    next_review_date: addDays(new Date(), interval_days).toISOString(),
  };
}

/**
 * Format interval days into a human-readable string.
 */
export function formatInterval(days: number): string {
  if (days < 1 / 144) return 'Now';
  if (days < 1 / 24) return `${Math.round(days * 1440)} minutes`;
  if (days < 1) return `${Math.round(days * 24)} hours`;
  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
}
