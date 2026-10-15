import { describe, expect, it } from 'vitest';
import {
  MAX_DAILY_REVIEW_FLASHCARDS,
  countDueCards,
  isCardDue,
  selectDueCards,
} from './flashcardsDue';

const NOW = new Date('2026-10-14T12:00:00.000Z');
const card = (next_review_date: string | null | undefined) => ({ next_review_date });

describe('isCardDue', () => {
  it('treats a missing schedule as due', () => {
    expect(isCardDue(null, NOW)).toBe(true);
    expect(isCardDue(undefined, NOW)).toBe(true);
    expect(isCardDue('', NOW)).toBe(true);
  });

  it('treats an unparseable date as due', () => {
    // The one surface that disagreed about this (the deck detail page) used
    // `new Date(x || 0) <= new Date()`, which is false for NaN and so hid the
    // card from its count while four other surfaces showed it.
    expect(isCardDue('not a date', NOW)).toBe(true);
  });

  it('includes a card scheduled for exactly now', () => {
    expect(isCardDue(NOW.toISOString(), NOW)).toBe(true);
  });

  it('excludes a future card', () => {
    expect(isCardDue('2026-10-15T12:00:00.000Z', NOW)).toBe(false);
  });
});

describe('countDueCards / selectDueCards', () => {
  const past = '2026-10-01T09:00:00.000Z';
  const future = '2026-11-01T09:00:00.000Z';

  it('counts every due card and ignores the ones that are not', () => {
    const cards = [card(past), card(future), card(null), card('rubbish')];
    expect(countDueCards(cards, NOW)).toBe(3);
  });

  it('caps the session but not the count', () => {
    // BUG-01: sixteen due cards advertised "16 cards due" and then opened a
    // session headed "Item 1 of 15".
    const cards = Array.from({ length: 16 }, () => card(past));
    expect(countDueCards(cards, NOW)).toBe(16);
    expect(selectDueCards(cards, NOW)).toHaveLength(MAX_DAILY_REVIEW_FLASHCARDS);
  });

  it('returns every due card when there are fewer than the cap', () => {
    const cards = [card(past), card(past), card(future)];
    expect(selectDueCards(cards, NOW)).toHaveLength(2);
  });

  it('honours an explicit limit', () => {
    const cards = Array.from({ length: 5 }, () => card(past));
    expect(selectDueCards(cards, NOW, 2)).toHaveLength(2);
  });
});
