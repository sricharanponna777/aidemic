import { describe, expect, it } from 'vitest';
import {
  calculateRetentionRate,
  calculateStudyStreak,
  formatInterval,
  previewNextReview,
  updateSpacedRepetition,
  type CardSRState,
} from './spacedRepetition';

const newCard = (): CardSRState => ({
  ease_factor: 2.5,
  interval_days: 1,
  repetition_count: 0,
  consecutive_correct: 0,
});

describe('formatInterval', () => {
  it('formats across unit thresholds', () => {
    expect(formatInterval(0)).toBe('<1m');
    expect(formatInterval(10 / 1440)).toBe('10m');
    expect(formatInterval(2 / 24)).toBe('2hr');
    expect(formatInterval(3)).toBe('3d');
    expect(formatInterval(60)).toBe('2mo');
    expect(formatInterval(365)).toBe('1y');
  });
});

describe('calculateRetentionRate', () => {
  it('returns 0 with no cards or no reviews', () => {
    expect(calculateRetentionRate([])).toBe(0);
    expect(calculateRetentionRate([{ times_studied: 0, times_correct: 0 }])).toBe(0);
  });

  it('is the share of reviews recalled correctly', () => {
    // 10 reviews, 8 recalled -> 80% retention
    expect(calculateRetentionRate([{ times_studied: 10, times_correct: 8 }])).toBe(80);
  });

  it('pools reviews across cards rather than averaging per card', () => {
    expect(calculateRetentionRate([
      { times_studied: 90, times_correct: 45 },
      { times_studied: 10, times_correct: 10 },
    ])).toBeCloseTo(55);
  });

  it('counts lapses that a relearned card no longer reflects in repetition_count', () => {
    // Regression: this card was failed 10 of 40 times but had been relearned,
    // so repetition_count === consecutive_correct and retention read 100%.
    let card: CardSRState = { ease_factor: 2.5, interval_days: 0, repetition_count: 0, consecutive_correct: 0, times_studied: 0, times_correct: 0 };
    const grades = [2, 2, 2];
    for (let i = 0; i < 10; i++) grades.push(0, 2, 2);
    for (const q of grades) card = { ...card, ...updateSpacedRepetition(card, q) };

    expect(card.repetition_count).toBe(card.consecutive_correct); // old proxy saw 0 lapses
    expect(calculateRetentionRate([card])).toBeLessThan(80);
  });
});

describe('calculateStudyStreak', () => {
  const atNoon = (daysAgo: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return d.getTime();
  };

  it('counts consecutive days ending today', () => {
    expect(calculateStudyStreak([atNoon(0), atNoon(1), atNoon(2)])).toBe(3);
  });

  it('keeps the streak alive before today\'s session is logged', () => {
    // Regression: anchoring only on today made a 30-day streak read 0 from
    // midnight until the student next studied.
    const dates = Array.from({ length: 30 }, (_, i) => atNoon(i + 1));
    expect(calculateStudyStreak(dates)).toBe(30);
  });

  it('breaks once a whole day is missed', () => {
    expect(calculateStudyStreak([atNoon(2), atNoon(3)])).toBe(0);
  });

  it('ignores duplicate sessions on the same day', () => {
    expect(calculateStudyStreak([atNoon(0), atNoon(0), atNoon(1)])).toBe(2);
  });

  it('ignores future-dated rows', () => {
    expect(calculateStudyStreak([atNoon(-3), atNoon(0), atNoon(1)])).toBe(2);
  });

  it('returns 0 with no dates', () => {
    expect(calculateStudyStreak([])).toBe(0);
  });
});

describe('updateSpacedRepetition', () => {
  it('resets the streak and shortens interval on "Again" (q=0)', () => {
    const result = updateSpacedRepetition(newCard(), 0);
    expect(result.consecutive_correct).toBe(0);
    expect(result.interval_days).toBeLessThan(1);
    expect(result.times_studied).toBe(1);
    expect(result.times_correct).toBe(0);
  });

  it('counts a good/easy answer as correct and advances the card', () => {
    const result = updateSpacedRepetition(newCard(), 3);
    expect(result.times_correct).toBe(1);
    expect(result.interval_days).toBeGreaterThan(0);
    expect(new Date(result.next_review_date).getTime()).not.toBeNaN();
  });

  it('previewNextReview matches the applied interval for the same input', () => {
    const card = newCard();
    const preview = previewNextReview(card, 2);
    const applied = updateSpacedRepetition(card, 2);
    expect(preview.interval_days).toBe(applied.interval_days);
  });
});
