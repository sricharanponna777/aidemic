import type { XpSource } from '@/types';

/**
 * The XP rules award_xp() applies (migration 20261103000000), mirrored for
 * display only -- the "How XP works" panel and the "up to +150 XP" chip on
 * Blurting. The server never reads these; rules.test.ts pins them to the SQL
 * so the explanation cannot drift from what is actually paid.
 */

/** Base XP: per mark available for marked sets (capped at 100 marks), flat otherwise. */
export const XP_RATES: ReadonlyArray<{ source: XpSource; label: string; xp: number; perMark: boolean }> = [
  { source: 'mock', label: 'Mock exam', xp: 15, perMark: true },
  { source: 'homework_scan', label: 'Handwritten paper', xp: 15, perMark: true },
  { source: 'assignment', label: 'Assignment', xp: 12, perMark: true },
  { source: 'exam_practice', label: 'Practice set', xp: 10, perMark: true },
  { source: 'blurt', label: 'Blurt', xp: 150, perMark: false },
  { source: 'review', label: 'Review question', xp: 10, perMark: false },
  { source: 'flashcard', label: 'Flashcard', xp: 5, perMark: false },
];

/** A score of 0 still earns this share of the base: the attempt is what is rewarded. */
export const MIN_QUALITY = 0.2;

export const STREAK_MULTIPLIERS: ReadonlyArray<{ fromDays: number; multiplier: number }> = [
  { fromDays: 0, multiplier: 1 },
  { fromDays: 3, multiplier: 1.25 },
  { fromDays: 7, multiplier: 1.5 },
  { fromDays: 30, multiplier: 2 },
];

export const DAILY_XP_CAP = 3000;

export const xpRate = (source: XpSource) => XP_RATES.find((rate) => rate.source === source);
