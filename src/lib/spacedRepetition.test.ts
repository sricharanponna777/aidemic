import { describe, expect, it } from 'vitest';
import {
  calculateRetentionRate,
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
    expect(calculateRetentionRate([{ repetition_count: 0, consecutive_correct: 0 }])).toBe(0);
  });

  it('penalises lapses (reviews beyond the consecutive-correct streak)', () => {
    // 10 reviews, 8 consecutive correct -> 2 lapses -> 80% retention
    expect(calculateRetentionRate([{ repetition_count: 10, consecutive_correct: 8 }])).toBe(80);
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
