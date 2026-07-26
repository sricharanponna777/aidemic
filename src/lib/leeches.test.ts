import { describe, expect, it } from 'vitest';
import { lapseCount, isLeech, countLeeches, LEECH_THRESHOLD } from './leeches';

describe('lapseCount', () => {
  it('is repetition_count minus consecutive_correct', () => {
    expect(lapseCount({ repetition_count: 12, consecutive_correct: 2 })).toBe(10);
  });
  it('never goes negative', () => {
    expect(lapseCount({ repetition_count: 1, consecutive_correct: 5 })).toBe(0);
  });
  it('treats missing fields as zero', () => {
    expect(lapseCount({})).toBe(0);
  });
});

describe('isLeech', () => {
  it('flags a card at the threshold', () => {
    expect(isLeech({ repetition_count: 8, consecutive_correct: 0 })).toBe(true);
  });
  it('does not flag below the threshold', () => {
    expect(isLeech({ repetition_count: 7, consecutive_correct: 0 })).toBe(false);
  });
  it('respects a custom threshold', () => {
    expect(isLeech({ repetition_count: 4, consecutive_correct: 0 }, 3)).toBe(true);
  });
  it('a well-learned card is never a leech', () => {
    expect(isLeech({ repetition_count: 20, consecutive_correct: 20 })).toBe(false);
  });
});

describe('countLeeches', () => {
  it('counts only cards over the threshold', () => {
    const cards = [
      { repetition_count: 10, consecutive_correct: 0 }, // 10 lapses -> leech
      { repetition_count: 9, consecutive_correct: 1 }, // 8 lapses -> leech
      { repetition_count: 5, consecutive_correct: 2 }, // 3 lapses -> no
      {},
    ];
    expect(countLeeches(cards)).toBe(2);
  });
  it('uses the default threshold constant', () => {
    expect(LEECH_THRESHOLD).toBe(8);
  });
});
