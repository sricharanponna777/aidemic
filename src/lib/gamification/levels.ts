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
  /** Plain-English line explaining the title. */
  blurb: string;
  /** Total XP at which the next level is reached. */
  nextLevelAt: number;
}

/**
 * Rank title, by the lowest level it is held from: a ladder of space
 * technology, each a bigger leap than the last. Deliberately no word in common
 * with the league tiers (leagues.ts), which are a ladder of object SIZE -- a
 * student is "a Probe in the Moon league", never two things with one name.
 *
 * `blurb` is the plain-English line shown beside the title. The test for both
 * is that a Year 10 with little general knowledge can see why each title
 * outranks the one before it.
 */
export const RANK_TITLES: ReadonlyArray<{ fromLevel: number; title: string; blurb: string }> = [
  { fromLevel: 1, title: 'Rover', blurb: 'Drives across the ground of another world.' },
  { fromLevel: 5, title: 'Satellite', blurb: 'Leaves the ground and circles a planet.' },
  { fromLevel: 10, title: 'Probe', blurb: 'Flies out alone to explore distant planets.' },
  { fromLevel: 15, title: 'Shuttle', blurb: 'Carries a crew into space and brings them home.' },
  { fromLevel: 20, title: 'Space Station', blurb: 'A base in orbit where a crew lives and works.' },
  { fromLevel: 30, title: 'Starship', blurb: 'Crosses the whole solar system with a crew aboard.' },
  { fromLevel: 40, title: 'Warp Drive', blurb: 'Bends space to travel faster than light.' },
  { fromLevel: 50, title: 'Dyson Sphere', blurb: 'A shell built around a star to capture all of its power.' },
];

const rankIndex = (level: number): number => {
  let index = 0;
  RANK_TITLES.forEach((rank, i) => {
    if (level >= rank.fromLevel) index = i;
  });
  return index;
};

export const rankTitle = (level: number): string => RANK_TITLES[rankIndex(level)].title;

/** The next title up and the level it arrives at, or null at the top. */
export const nextRank = (level: number): { fromLevel: number; title: string; blurb: string } | null =>
  RANK_TITLES[rankIndex(level) + 1] ?? null;

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
    title: RANK_TITLES[rankIndex(level)].title,
    blurb: RANK_TITLES[rankIndex(level)].blurb,
    nextLevelAt: floor + span,
  };
};
