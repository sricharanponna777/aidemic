import { describe, expect, it } from 'vitest';
import {
  SELF_RATING_COOLDOWN_MS,
  isSelfRating,
  shouldEmitSelfRatingEvent,
} from './fromSelfRating';

const NOW = new Date('2026-07-29T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600000).toISOString();

describe('isSelfRating', () => {
  it('accepts the three ratings', () => {
    expect(isSelfRating('red')).toBe(true);
    expect(isSelfRating('amber')).toBe(true);
    expect(isSelfRating('green')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isSelfRating('GREEN')).toBe(false);
    expect(isSelfRating('')).toBe(false);
    expect(isSelfRating(null)).toBe(false);
    expect(isSelfRating(1)).toBe(false);
  });
});

describe('shouldEmitSelfRatingEvent', () => {
  it('emits the first time a subtopic is rated', () => {
    expect(shouldEmitSelfRatingEvent(null, 'red', null, NOW)).toBe(true);
  });

  it('emits when the rating changes, however recently it was rated', () => {
    expect(shouldEmitSelfRatingEvent('red', 'green', hoursAgo(0.01), NOW)).toBe(true);
    expect(shouldEmitSelfRatingEvent('green', 'amber', hoursAgo(1), NOW)).toBe(true);
  });

  it('suppresses an unchanged rating inside the cooldown', () => {
    expect(shouldEmitSelfRatingEvent('green', 'green', hoursAgo(1), NOW)).toBe(false);
    expect(shouldEmitSelfRatingEvent('green', 'green', hoursAgo(23), NOW)).toBe(false);
  });

  it('re-emits an unchanged rating once the cooldown has passed', () => {
    expect(shouldEmitSelfRatingEvent('green', 'green', hoursAgo(24), NOW)).toBe(true);
    expect(shouldEmitSelfRatingEvent('green', 'green', hoursAgo(72), NOW)).toBe(true);
  });

  it('treats the cooldown boundary as elapsed', () => {
    const boundary = new Date(NOW.getTime() - SELF_RATING_COOLDOWN_MS).toISOString();
    expect(shouldEmitSelfRatingEvent('red', 'red', boundary, NOW)).toBe(true);
  });

  it('emits when the stored rating matches but no event was ever recorded', () => {
    // The label can exist without evidence: an event insert can fail after the
    // label update, and a dropped event must not silence the next click forever.
    expect(shouldEmitSelfRatingEvent('amber', 'amber', null, NOW)).toBe(true);
  });

  it('emits rather than swallowing when the timestamp is unparseable', () => {
    expect(shouldEmitSelfRatingEvent('amber', 'amber', 'not-a-date', NOW)).toBe(true);
  });
});
