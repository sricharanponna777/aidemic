import { describe, expect, it } from 'vitest';
import { levelForXp, levelProgress, rankTitle, xpForLevel } from './levels';

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
    expect(progress.title).toBe('Astral Scholar');
  });
});

describe('rankTitle', () => {
  it('holds a title from its starting level until the next one', () => {
    expect(rankTitle(1)).toBe('Cadet');
    expect(rankTitle(4)).toBe('Cadet');
    expect(rankTitle(5)).toBe('Navigator');
    expect(rankTitle(99)).toBe('Cosmic Architect');
  });
});
