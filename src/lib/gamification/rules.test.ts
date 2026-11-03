import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAILY_XP_CAP, MIN_QUALITY, STREAK_MULTIPLIERS, XP_RATES } from './rules';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261103000000_add_gamification.sql'), 'utf8');

describe('XP rules mirror award_xp()', () => {
  it('pays the same base per source', () => {
    for (const { source, xp, perMark } of XP_RATES) {
      const pattern = perMark
        ? new RegExp(`WHEN '${source}'\\s+THEN ${xp} \\* v_marks`)
        : new RegExp(`WHEN '${source}'\\s+THEN ${xp}\\b`);
      if (source === 'flashcard') expect(sql).toMatch(/ELSE 5\s+-- flashcard/);
      else expect(sql).toMatch(pattern);
    }
  });

  it('uses the same quality floor, streak multipliers and daily cap', () => {
    expect(sql).toContain(`(${MIN_QUALITY} + 0.8 * v_score)`);
    for (const { fromDays, multiplier } of STREAK_MULTIPLIERS.slice(1)) {
      // The SQL writes 2 as 2.0.
      const literal = String(multiplier).replace('.', '\\.');
      expect(sql).toMatch(new RegExp(`p_streak >= ${fromDays}\\s+THEN ${literal}(\\.0)?\\b`));
    }
    expect(sql).toContain(`c_daily_cap constant int := ${DAILY_XP_CAP};`);
  });
});
