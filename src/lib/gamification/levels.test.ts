import { describe, expect, it } from 'vitest';
import { RANK_TITLES, levelForXp, levelProgress, nextRank, rankTitle, xpForLevel } from './levels';

describe('xpForLevel', () => {
  it('makes level 1 free and each level cost 100 more than the last', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
    expect(xpForLevel(5)).toBe(1000);
    expect(xpForLevel(20)).toBe(19000);
  });
});

describe('levelForXp', () => {
  it('starts at level 1', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
  });

  it('levels up exactly on the boundary, not one XP after it', () => {
    for (let level = 2; level <= 200; level += 1) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
  });

  it('treats bad input as zero rather than NaN', () => {
    expect(levelForXp(Number.NaN)).toBe(1);
    expect(levelForXp(-50)).toBe(1);
  });
});

describe('levelProgress', () => {
  it('measures progress within the current level', () => {
    // Level 18 spans 15,300 -> 17,100.
    const progress = levelProgress(16200);
    expect(progress.level).toBe(18);
    expect(progress.xpIntoLevel).toBe(900);
    expect(progress.xpForNextLevel).toBe(1800);
    expect(progress.fraction).toBe(0.5);
    expect(progress.title).toBe('Shuttle');
  });
});

describe('rankTitle', () => {
  it('holds a title from its starting level until the next one', () => {
    expect(rankTitle(1)).toBe('Rover');
    expect(rankTitle(4)).toBe('Rover');
    expect(rankTitle(5)).toBe('Satellite');
    expect(rankTitle(99)).toBe('Dyson Sphere');
  });

  it('starts at level 1 and climbs strictly', () => {
    expect(RANK_TITLES[0].fromLevel).toBe(1);
    for (let i = 1; i < RANK_TITLES.length; i += 1) {
      expect(RANK_TITLES[i].fromLevel).toBeGreaterThan(RANK_TITLES[i - 1].fromLevel);
    }
  });
});

describe('nextRank', () => {
  it('names the title still to come, and nothing past the top', () => {
    expect(nextRank(1)).toMatchObject({ title: 'Satellite', fromLevel: 5 });
    expect(nextRank(17)).toMatchObject({ title: 'Space Station', fromLevel: 20 });
    expect(nextRank(50)).toBeNull();
  });
});
