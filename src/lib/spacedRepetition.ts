// SM-2 spaced repetition helpers

export interface CardSR {
  ease_factor: number;
  interval_days: number;
  repetition_count: number;
  consecutive_correct: number;
}

export type CardSRState = CardSR & {
  last_studied_at?: string | null;
  next_review_date?: string | null;
  times_studied?: number;
  times_correct?: number;
};

/** Lifetime review tallies. These are the only card counters that survive a
 *  lapse (`repetition_count` is reset to 0 by `computeNextState`), so every
 *  retention/accuracy metric must be derived from these two fields. */
export type CardRetentionStats = {
  times_studied?: number | null;
  times_correct?: number | null;
};

const MIN_INTERVAL_DAYS = 1 / 1440; // 1 minute
const HARD_INTERVAL = 1.2;
const EASY_BONUS = 1.3;
const NEW_INTERVAL = 0.0; // Anki-style default for post-relearning interval factor
const INTERVAL_MODIFIER = 1.0;
const MAX_INTERVAL_DAYS = 36500;
const LEARNING_STEP_AGAIN_DAYS = 1 / 1440; // 1 minute
const LEARNING_STEP_GOOD_DAYS = 10 / 1440; // 10 minutes
const GRADUATING_INTERVAL_DAYS = 1;
const EASY_GRADUATING_INTERVAL_DAYS = 4;

function clampQuality(quality: number): 0 | 1 | 2 | 3 {
  if (quality <= 0) return 0;
  if (quality >= 3) return 3;
  return quality as 1 | 2;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizeCard(card: CardSR): CardSR {
  return {
    ease_factor: Math.max(1.3, card.ease_factor || 2.5),
    interval_days: Math.max(0, card.interval_days || 0),
    repetition_count: Math.max(0, card.repetition_count || 0),
    consecutive_correct: Math.max(0, card.consecutive_correct || 0),
  };
}

function clampInterval(days: number): number {
  return Math.min(MAX_INTERVAL_DAYS, Math.max(MIN_INTERVAL_DAYS, days));
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeOverdueDays(prev: CardSRState, now: Date): number {
  const due = parseDate(prev.next_review_date);
  if (!due) return 0;
  const lateMs = now.getTime() - due.getTime();
  if (lateMs <= 0) return 0;
  return lateMs / 86400000;
}

function computeNextState(prev: CardSRState, quality: number, now: Date): CardSR {
  const q = clampQuality(quality);
  const normalized = normalizeCard(prev);

  let {
    ease_factor,
    interval_days,
    repetition_count,
    consecutive_correct,
  } = normalized;

  const previousInterval = interval_days;
  const overdueDays = computeOverdueDays(prev, now);
  const adjustedCurrentInterval = Math.max(0, previousInterval + overdueDays);
  const currentInterval = adjustedCurrentInterval > 0 ? adjustedCurrentInterval : 1;
  const isLearning = repetition_count === 0;

  if (isLearning) {
    // Learning/relearning stage: Again/Hard do not modify ease.
    if (q === 0) {
      consecutive_correct = 0;
      interval_days = LEARNING_STEP_AGAIN_DAYS;
    } else if (q === 1) {
      consecutive_correct = 0;
      interval_days = (LEARNING_STEP_AGAIN_DAYS + LEARNING_STEP_GOOD_DAYS) / 2;
    } else if (q === 2) {
      if (previousInterval < LEARNING_STEP_GOOD_DAYS) {
        interval_days = LEARNING_STEP_GOOD_DAYS;
      } else {
        interval_days = GRADUATING_INTERVAL_DAYS;
        repetition_count = 1;
        consecutive_correct = 1;
      }
    } else {
      // Easy: graduate immediately.
      interval_days = EASY_GRADUATING_INTERVAL_DAYS;
      repetition_count = 1;
      consecutive_correct = 1;
    }

    return {
      ease_factor,
      interval_days: clampInterval(interval_days),
      repetition_count,
      consecutive_correct,
    };
  }

  if (q === 0) {
    // Again: lapse/relearning, ease -20 percentage points.
    repetition_count = 0;
    consecutive_correct = 0;
    interval_days = clampInterval(currentInterval * NEW_INTERVAL);
    ease_factor = Math.max(1.3, ease_factor - 0.2);
  } else if (q === 1) {
    // Hard: ease -15 percentage points, interval * hard interval.
    consecutive_correct = 0;
    const hardInterval = currentInterval * HARD_INTERVAL * INTERVAL_MODIFIER;
    interval_days = clampInterval(Math.max(previousInterval + 1, hardInterval));
    ease_factor = Math.max(1.3, ease_factor - 0.15);
  } else {
    // Good/Easy: pass review and grow interval by ease.
    repetition_count += 1;
    consecutive_correct += 1;

    if (q === 3) {
      // Easy: ease +15 percentage points, interval * ease * easy bonus.
      ease_factor = Math.max(1.3, ease_factor + 0.15);
      const easyInterval = currentInterval * ease_factor * EASY_BONUS * INTERVAL_MODIFIER;
      interval_days = clampInterval(Math.max(previousInterval + 1, easyInterval));
    } else {
      // Good: interval * ease.
      const goodInterval = currentInterval * ease_factor * INTERVAL_MODIFIER;
      interval_days = clampInterval(Math.max(previousInterval + 1, goodInterval));
    }
  }

  return {
    ease_factor,
    interval_days,
    repetition_count,
    consecutive_correct,
  };
}

export function updateSpacedRepetition(
  prev: CardSRState,
  quality: number
): {
  ease_factor: number;
  interval_days: number;
  next_review_date: string;
  repetition_count: number;
  consecutive_correct: number;
  last_studied_at: string;
  times_studied: number;
  times_correct: number;
} {
  const now = new Date();
  const updated = computeNextState(prev, quality, now);

  return {
    ease_factor: updated.ease_factor,
    interval_days: updated.interval_days,
    next_review_date: addDays(now, updated.interval_days).toISOString(),
    repetition_count: updated.repetition_count,
    consecutive_correct: updated.consecutive_correct,
    last_studied_at: now.toISOString(),
    times_studied: (prev.times_studied || 0) + 1,
    times_correct: (prev.times_correct || 0) + (quality >= 2 ? 1 : 0),
  };
}

export function previewNextReview(
  prev: CardSRState,
  quality: number
): { interval_days: number; next_review_date: string } {
  const now = new Date();
  const updated = computeNextState(prev, quality, now);

  return {
    interval_days: updated.interval_days,
    next_review_date: addDays(now, updated.interval_days).toISOString(),
  };
}

export function formatInterval(days: number): string {
  const safeDays = Number.isFinite(days) && days > 0 ? days : 0;
  const minutes = safeDays * 1440;
  const hours = safeDays * 24;
  const months = safeDays / 30;
  const years = safeDays / 365;

  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  if (hours < 24) return `${Math.max(1, Math.round(hours))}hr`;
  if (safeDays < 30) return `${Math.max(1, Math.round(safeDays))}d`;
  if (safeDays < 365) return `${Number(months.toFixed(1))}mo`;
  return `${Number(years.toFixed(1))}y`;
}

/**
 * Share of all reviews the student actually recalled, as a percentage.
 *
 * Derived from the lifetime `times_studied`/`times_correct` tallies rather than
 * `repetition_count - consecutive_correct`: that older proxy could not see
 * lapses at all, because a lapse resets `repetition_count` to 0 in lockstep
 * with `consecutive_correct`, so a card failed ten times still reported zero
 * lapses and the dashboard showed 100% retention for a struggling student.
 */
export function calculateRetentionRate(cards: CardRetentionStats[]): number {
  if (cards.length === 0) return 0;

  const totalReviews = cards.reduce((sum, card) => sum + Math.max(0, card.times_studied || 0), 0);
  if (totalReviews === 0) return 0;

  const totalCorrect = cards.reduce(
    (sum, card) => sum + Math.min(Math.max(0, card.times_correct || 0), Math.max(0, card.times_studied || 0)),
    0
  );

  return (totalCorrect / totalReviews) * 100;
}

/** Local midnight of the calendar day before `ts`. Uses date arithmetic rather
 *  than subtracting 24h so the walk doesn't drift across a DST boundary. */
function previousDay(ts: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Consecutive calendar days with at least one review, counting back from the
 * most recent one.
 *
 * A streak stays alive until a whole day is missed, so it anchors on today when
 * the student has already studied and otherwise on yesterday. Anchoring only on
 * today made a 30-day streak display as 0 from midnight until the next session
 * was logged.
 */
export function calculateStudyStreak(reviewDates: number[]): number {
  if (reviewDates.length === 0) return 0;

  const uniqueDays = new Set<number>();
  for (const reviewDate of reviewDates) {
    if (!Number.isFinite(reviewDate)) continue;
    const day = new Date(reviewDate);
    day.setHours(0, 0, 0, 0);
    uniqueDays.add(day.getTime());
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = today.getTime();
  const yesterdayTs = previousDay(todayTs);

  // Drop days stamped in the future (clock skew or bad rows) before walking back.
  const sortedDays = Array.from(uniqueDays)
    .filter((ts) => ts <= todayTs)
    .sort((a, b) => b - a);

  const newest = sortedDays[0];
  if (newest === undefined || newest < yesterdayTs) return 0;

  let streak = 0;
  let expected = newest;
  for (const dayTs of sortedDays) {
    if (dayTs !== expected) break;
    streak += 1;
    expected = previousDay(expected);
  }

  return streak;
}

export function getMotivationMessage(streak: number, retentionRate: number): string {
  if (retentionRate < 60) {
    return "Take it steady. Short, frequent reviews will help your retention rebound.";
  }
  if (streak === 0) {
    return "Start your learning journey today.";
  }
  if (streak < 3) {
    return "Good start. Keep the momentum going.";
  }
  if (streak < 7) {
    return `Nice work. You are on a ${streak} day streak.`;
  }
  if (streak < 30) {
    return `Strong consistency. ${streak} days in a row is building real long-term memory.`;
  }
  return `Outstanding consistency. ${streak} straight days is elite work.`;
}

export function calculateGoalProgress(
  cardsStudiedToday: number,
  dailyGoal: number,
  weeklyStreak: number
): { percentage: number; message: string; achieved: boolean } {
  const safeGoal = Math.max(1, dailyGoal);
  const percentage = Math.min(100, (cardsStudiedToday / safeGoal) * 100);
  const achieved = cardsStudiedToday >= safeGoal;

  let message: string;
  if (achieved) {
    message = `Goal achieved: ${cardsStudiedToday}/${safeGoal} cards studied. Streak: ${weeklyStreak} days.`;
  } else if (percentage >= 75) {
    message = `Almost there: ${cardsStudiedToday}/${safeGoal} cards studied. Streak: ${weeklyStreak} days.`;
  } else if (percentage >= 50) {
    message = `Good progress: ${cardsStudiedToday}/${safeGoal} cards studied. Streak: ${weeklyStreak} days.`;
  } else {
    message = `Keep going: ${cardsStudiedToday}/${safeGoal} cards studied. Streak: ${weeklyStreak} days.`;
  }

  return { percentage, message, achieved };
}
