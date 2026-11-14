/**
 * Display labels for schools.nation, which the seed writes as a slug.
 *
 * Shared because two screens need the same wording for the same value: teacher
 * onboarding, which shows it to tell 25 schools called "St Mary's" apart, and the
 * school admin workspace header.
 */
export const NATION_LABELS: Record<string, string> = {
  england: 'England',
  wales: 'Wales',
  scotland: 'Scotland',
  'northern-ireland': 'Northern Ireland',
};

/** Falls back to the raw slug rather than an empty string: an unrecognised nation
 *  is a seed bug worth seeing, not worth hiding. */
export const nationLabel = (nation: string | null | undefined): string | null =>
  nation ? NATION_LABELS[nation] ?? nation : null;
