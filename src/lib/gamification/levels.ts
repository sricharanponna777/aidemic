/**
 * Level curve and rank titles.
 *
 * Levels are NOT stored: the database keeps only `user_xp.total_xp`, and this
 * is the single place a level is derived from it. Changing the curve re-levels
 * everyone at once, consistently, with no migration.
 *
 * Reaching level L takes 50 * L * (L - 1) XP in total, so each level costs 100
 * more than the last: L2 at 100, L5 at 1,000, L10 at 4,500, L20 at 19,000.
 */

const XP_STEP = 50;

/** Total XP needed to reach `level` (level 1 is free). */
export const xpForLevel = (level: number): number => {
  const l = Math.max(1, Math.floor(level));
  return XP_STEP * l * (l - 1);
};

export const levelForXp = (totalXp: number): number => {
  const xp = Number.isFinite(totalXp) ? Math.max(0, totalXp) : 0;
  // Inverse of xpForLevel, then corrected either way for float rounding at
  // the exact boundaries.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * xp) / XP_STEP)) / 2));
  while (xpForLevel(level + 1) <= xp) level += 1;
  while (level > 1 && xpForLevel(level) > xp) level -= 1;
  return level;
};

export interface LevelProgress {
  level: number;
  /** XP earned since reaching `level`. */
  xpIntoLevel: number;
  /** XP the whole of this level spans. */
  xpForNextLevel: number;
  /** 0..1, for the progress bar. */
  fraction: number;
  title: string;
}

/** Space-themed rank title, by the lowest level it is held from. */
export const RANK_TITLES: ReadonlyArray<{ fromLevel: number; title: string }> = [
  { fromLevel: 1, title: 'Cadet' },
  { fromLevel: 5, title: 'Navigator' },
  { fromLevel: 10, title: 'Pilot' },
  { fromLevel: 15, title: 'Astral Scholar' },
  { fromLevel: 20, title: 'Star Commander' },
  { fromLevel: 30, title: 'Nebula Sage' },
  { fromLevel: 40, title: 'Galactic Luminary' },
  { fromLevel: 50, title: 'Cosmic Architect' },
];

export const rankTitle = (level: number): string => {
  let title = RANK_TITLES[0].title;
  for (const rank of RANK_TITLES) if (level >= rank.fromLevel) title = rank.title;
  return title;
};

export const levelProgress = (totalXp: number): LevelProgress => {
  const xp = Number.isFinite(totalXp) ? Math.max(0, totalXp) : 0;
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const span = xpForLevel(level + 1) - floor;
  return {
    level,
    xpIntoLevel: xp - floor,
    xpForNextLevel: span,
    fraction: span > 0 ? (xp - floor) / span : 0,
    title: rankTitle(level),
  };
};
