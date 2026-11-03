/**
 * The ten weekly league tiers, lowest first -- a ladder of object SIZE, each
 * a bigger thing than the last.
 *
 * The database (`league_tiers`, migration 20261103010000) is the source of
 * truth for names and is what the RPCs return; this mirror exists for the
 * `blurb` line, which says what each object is so a Year 10 can see the
 * order without knowing any astronomy, and for drawing the whole ladder
 * before a student has been placed. leagues.test.ts pins it to the migration.
 */
export const LEAGUE_TIERS: ReadonlyArray<{ tier: number; slug: string; name: string; blurb: string }> = [
  { tier: 1, slug: 'rock', name: 'Rock', blurb: 'A lump of space rock. Everyone starts here.' },
  { tier: 2, slug: 'asteroid', name: 'Asteroid', blurb: 'A rock big enough to orbit the Sun on its own.' },
  { tier: 3, slug: 'moon', name: 'Moon', blurb: 'Big enough to circle a planet.' },
  { tier: 4, slug: 'planet', name: 'Planet', blurb: 'A whole world, like Earth.' },
  { tier: 5, slug: 'giant-planet', name: 'Giant Planet', blurb: 'A huge gas world, like Jupiter.' },
  { tier: 6, slug: 'star', name: 'Star', blurb: 'A sun, big enough to hold planets in orbit.' },
  { tier: 7, slug: 'giant-star', name: 'Giant Star', blurb: 'A star hundreds of times wider than our Sun.' },
  { tier: 8, slug: 'star-cluster', name: 'Star Cluster', blurb: 'Thousands of stars packed together.' },
  { tier: 9, slug: 'galaxy', name: 'Galaxy', blurb: 'Billions of stars, like our Milky Way.' },
  { tier: 10, slug: 'universe', name: 'Universe', blurb: 'Everything there is. The top league.' },
];

export const leagueTier = (tier: number | null | undefined) =>
  LEAGUE_TIERS.find((entry) => entry.tier === tier) ?? LEAGUE_TIERS[0];

/** "Moon League". */
export const leagueLabel = (name: string | null | undefined): string => `${name || LEAGUE_TIERS[0].name} League`;
