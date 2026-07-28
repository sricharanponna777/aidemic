/**
 * Weakness ranking.
 *
 * Exam attempts emit `weakness_tags` (falling back to `weakness_analysis`).
 * Ranking those by lifetime count alone means a weakness the student hit eight
 * times in January and has since fixed permanently outranks one they hit four
 * times last week — so the dashboard's "most common weak area" drifts further
 * from what the student is actually struggling with the longer they use the app.
 *
 * Instead each occurrence decays exponentially with age, so the ranking tracks
 * what is currently costing marks, and each tag carries a trend derived from how
 * often it shows up per attempt now versus earlier — a weakness seen twice in
 * twenty recent attempts is improving, even though its raw count went up.
 */

/** Days after which a single occurrence counts half as much toward the ranking. */
export const WEAKNESS_HALF_LIFE_DAYS = 21;

/** Occurrences at or under this age form the "recent" window used for trends. */
const RECENT_WINDOW_DAYS = 14;
/** The comparison window runs from RECENT_WINDOW_DAYS back to here. */
const PRIOR_WINDOW_DAYS = 42;

const DAY_MS = 86400000;

export type WeaknessTrend = 'new' | 'worsening' | 'persistent' | 'improving';

export interface WeaknessAttempt {
  /** ISO timestamp of the attempt; undated attempts are ignored for ranking. */
  createdAt: string | null;
  subject: string;
  /** Already-extracted tags for this attempt (weakness_tags or _analysis). */
  tags: string[];
}

export interface RankedWeakness {
  tag: string;
  /** Lifetime number of attempts that flagged this tag. */
  count: number;
  /** Attempts in the last RECENT_WINDOW_DAYS that flagged it. */
  recentCount: number;
  subjects: string[];
  /** Recency-weighted score used for the ordering. */
  score: number;
  /** Whole days since this weakness was last seen. */
  lastSeenDaysAgo: number;
  trend: WeaknessTrend;
}

/** Tidies a raw tag/analysis string into a stable, displayable label. */
export const normalizeInsightLabel = (value: string) =>
  value
    .replace(/^Main pattern to fix:\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim()
    .slice(0, 70);

const ageInDays = (createdAt: string | null, now: number): number | null => {
  if (!createdAt) return null;
  const ts = new Date(createdAt).getTime();
  if (!Number.isFinite(ts)) return null;
  // Clamp future-dated rows to "now" rather than letting them score above 1.
  return Math.max(0, (now - ts) / DAY_MS);
};

const classifyTrend = (
  recentRate: number,
  priorRate: number,
  recentCount: number,
  priorAttempts: number
): WeaknessTrend => {
  if (recentCount === 0) return 'improving';
  // Nothing to compare against yet — this is newly observed, not a regression.
  if (priorAttempts === 0 || priorRate === 0) return 'new';
  if (recentRate > priorRate * 1.4) return 'worsening';
  if (recentRate < priorRate * 0.6) return 'improving';
  return 'persistent';
};

/**
 * Rank a student's weaknesses, most pressing first.
 *
 * @param attempts every attempt to consider (newest-first order not required)
 * @param limit    how many ranked weaknesses to return
 */
export function rankWeaknesses(
  attempts: WeaknessAttempt[],
  { now = new Date(), limit = 6, halfLifeDays = WEAKNESS_HALF_LIFE_DAYS }: { now?: Date; limit?: number; halfLifeDays?: number } = {}
): RankedWeakness[] {
  const nowMs = now.getTime();

  let recentAttempts = 0;
  let priorAttempts = 0;
  const byTag = new Map<
    string,
    { count: number; recentCount: number; priorCount: number; score: number; minAge: number; subjects: Set<string> }
  >();

  for (const attempt of attempts) {
    const age = ageInDays(attempt.createdAt, nowMs);
    if (age === null) continue;

    const isRecent = age < RECENT_WINDOW_DAYS;
    const isPrior = age >= RECENT_WINDOW_DAYS && age < PRIOR_WINDOW_DAYS;
    if (isRecent) recentAttempts += 1;
    if (isPrior) priorAttempts += 1;

    // One attempt flagging the same tag twice should still count once.
    const seen = new Set<string>();
    for (const raw of attempt.tags) {
      const tag = normalizeInsightLabel(raw);
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);

      const entry = byTag.get(tag) ?? {
        count: 0,
        recentCount: 0,
        priorCount: 0,
        score: 0,
        minAge: Number.POSITIVE_INFINITY,
        subjects: new Set<string>(),
      };
      entry.count += 1;
      if (isRecent) entry.recentCount += 1;
      if (isPrior) entry.priorCount += 1;
      entry.score += Math.pow(0.5, age / halfLifeDays);
      entry.minAge = Math.min(entry.minAge, age);
      if (attempt.subject) entry.subjects.add(attempt.subject);
      byTag.set(tag, entry);
    }
  }

  return [...byTag.entries()]
    .map(([tag, entry]) => {
      // Compare per-attempt rates, not raw counts: doing more practice should
      // not by itself make a weakness look like it is getting worse.
      const recentRate = recentAttempts > 0 ? entry.recentCount / recentAttempts : 0;
      const priorRate = priorAttempts > 0 ? entry.priorCount / priorAttempts : 0;
      return {
        tag,
        count: entry.count,
        recentCount: entry.recentCount,
        subjects: [...entry.subjects],
        score: entry.score,
        lastSeenDaysAgo: Math.floor(entry.minAge),
        trend: classifyTrend(recentRate, priorRate, entry.recentCount, priorAttempts),
      };
    })
    .sort((a, b) => b.score - a.score || b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

/** Short human label for a trend, for badges next to a weakness. */
export const trendLabel = (trend: WeaknessTrend): string =>
  trend === 'worsening' ? 'Getting worse'
    : trend === 'improving' ? 'Improving'
    : trend === 'new' ? 'New'
    : 'Still recurring';
