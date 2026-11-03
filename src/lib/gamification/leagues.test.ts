import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEAGUE_TIERS, leagueLabel, leagueTier } from './leagues';
import { RANK_TITLES } from './levels';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261103010000_rename_leagues_and_badges.sql'),
  'utf8'
);

describe('LEAGUE_TIERS', () => {
  it('matches the names and slugs the migration writes, tier for tier', () => {
    expect(LEAGUE_TIERS).toHaveLength(10);
    for (const { tier, slug, name } of LEAGUE_TIERS) {
      expect(migration).toMatch(new RegExp(`\\(${tier},\\s+'${slug}',\\s+'${name}'\\)`));
    }
  });

  it('shares no word with the level titles', () => {
    const titleWords = new Set(RANK_TITLES.flatMap((r) => r.title.toLowerCase().split(' ')));
    for (const { name } of LEAGUE_TIERS) {
      for (const word of name.toLowerCase().split(' ')) expect(titleWords.has(word)).toBe(false);
    }
  });
});

describe('leagueTier / leagueLabel', () => {
  it('falls back to the bottom tier', () => {
    expect(leagueTier(3).name).toBe('Moon');
    expect(leagueTier(null).name).toBe('Rock');
    expect(leagueLabel('Giant Star')).toBe('Giant Star League');
    expect(leagueLabel(undefined)).toBe('Rock League');
  });
});
