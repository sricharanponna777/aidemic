import { describe, expect, it } from 'vitest';
import { lapseCount, isLeech, countLeeches, LEECH_THRESHOLD } from './leeches';

describe('lapseCount', () => {
  it('is times_studied minus times_correct', () => {
    expect(lapseCount({ times_studied: 12, times_correct: 2 })).toBe(10);
  });
  it('never goes negative when times_correct exceeds times_studied', () => {
    expect(lapseCount({ times_studied: 1, times_correct: 5 })).toBe(0);
  });
  it('treats missing fields as zero', () => {
    expect(lapseCount({})).toBe(0);
  });
});

describe('isLeech', () => {
  it('flags a card at the threshold', () => {
    expect(isLeech({ times_studied: 8, times_correct: 0 })).toBe(true);
  });
  it('does not flag below the threshold', () => {
    expect(isLeech({ times_studied: 7, times_correct: 0 })).toBe(false);
  });
  it('respects a custom threshold', () => {
    expect(isLeech({ times_studied: 4, times_correct: 0 }, 3)).toBe(true);
  });
  it('a well-learned card is never a leech', () => {
    expect(isLeech({ times_studied: 20, times_correct: 20 })).toBe(false);
  });
  it('counts lapses that happened before the card was relearned', () => {
    // Regression: a card failed 10 times then relearned resets repetition_count
    // to 0, so the old proxy scored it 0 lapses and it was never flagged.
    expect(isLeech({ times_studied: 40, times_correct: 30 })).toBe(true);
  });
});

describe('countLeeches', () => {
  it('counts only cards over the threshold', () => {
    const cards = [
      { times_studied: 10, times_correct: 0 }, // 10 lapses -> leech
      { times_studied: 9, times_correct: 1 }, // 8 lapses -> leech
      { times_studied: 5, times_correct: 2 }, // 3 lapses -> no
      {},
    ];
    expect(countLeeches(cards)).toBe(2);
  });
  it('uses the default threshold constant', () => {
    expect(LEECH_THRESHOLD).toBe(8);
  });
});
