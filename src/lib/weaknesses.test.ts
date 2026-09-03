import { describe, expect, it } from 'vitest';
import { normalizeInsightLabel, rankWeaknesses, trendLabel, type WeaknessAttempt } from './weaknesses';

const NOW = new Date('2026-07-28T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

const at = (days: number, tags: string[], subject = 'biology'): WeaknessAttempt => ({
  createdAt: daysAgo(days),
  subject,
  tags,
});

describe('normalizeInsightLabel', () => {
  it('strips the analysis prefix, trailing period and extra whitespace', () => {
    expect(normalizeInsightLabel('Main pattern to fix:  Unit   conversion.')).toBe('Unit conversion');
  });
  it('truncates very long labels', () => {
    expect(normalizeInsightLabel('x'.repeat(200))).toHaveLength(70);
  });

  // Marking writes these tags verbatim, so the stored set is a mix of prose and
  // internal-looking identifiers. Parents must never be shown the latter.
  it('turns a slug into readable words and drops the leading qualifier', () => {
    expect(normalizeInsightLabel('confusion-osmosis-ions')).toBe('Osmosis ions');
    expect(normalizeInsightLabel('missing-root-hair')).toBe('Root hair');
    expect(normalizeInsightLabel('missing-cohesion-tension')).toBe('Cohesion tension');
  });

  it('keeps the qualifier when dropping it would leave a single bare word', () => {
    expect(normalizeInsightLabel('missing_detail')).toBe('Missing detail');
    expect(normalizeInsightLabel('incomplete_explanation')).toBe('Incomplete explanation');
  });

  it('reads through a coded prefix to the label behind it', () => {
    expect(normalizeInsightLabel('missing_keyword:aerobic respiration')).toBe('Aerobic respiration');
  });

  it('leaves labels that are already prose alone apart from capitalisation', () => {
    expect(normalizeInsightLabel('MCQ accuracy')).toBe('MCQ accuracy');
    expect(normalizeInsightLabel('Evaluation depth')).toBe('Evaluation depth');
  });

  it('humanises a slug that carries no qualifier at all', () => {
    expect(normalizeInsightLabel('linear_equations')).toBe('Linear equations');
    expect(normalizeInsightLabel('interpreting_tables')).toBe('Interpreting tables');
  });
});

describe('rankWeaknesses', () => {
  it('ranks a live weakness above a larger one the student has moved past', () => {
    const attempts: WeaknessAttempt[] = [
      // Fixed long ago, but seen far more often in total.
      ...Array.from({ length: 8 }, (_, i) => at(120 + i, ['Unit conversion'])),
      // Fewer occurrences, but happening right now.
      ...Array.from({ length: 3 }, (_, i) => at(i + 1, ['Evaluation depth'])),
    ];

    const ranked = rankWeaknesses(attempts, { now: NOW });

    expect(ranked[0].tag).toBe('Evaluation depth');
    expect(ranked[0].count).toBe(3);
    // The stale weakness is still reported, just not as the headline.
    expect(ranked.map((w) => w.tag)).toContain('Unit conversion');
  });

  it('flags a weakness that is appearing more often per attempt as worsening', () => {
    const attempts: WeaknessAttempt[] = [
      ...Array.from({ length: 4 }, (_, i) => at(20 + i, i === 0 ? ['Graph reading'] : [])),
      ...Array.from({ length: 4 }, (_, i) => at(i + 1, ['Graph reading'])),
    ];

    expect(rankWeaknesses(attempts, { now: NOW })[0].trend).toBe('worsening');
  });

  it('flags a weakness as improving when it stops appearing', () => {
    const attempts: WeaknessAttempt[] = [
      ...Array.from({ length: 4 }, (_, i) => at(20 + i, ['Rearranging equations'])),
      ...Array.from({ length: 4 }, (_, i) => at(i + 1, [])),
    ];

    const ranked = rankWeaknesses(attempts, { now: NOW });
    expect(ranked[0].trend).toBe('improving');
    expect(ranked[0].recentCount).toBe(0);
  });

  it('does not call a weakness worsening just because the student practised more', () => {
    // Same 50% hit rate in both windows, but many more recent attempts.
    const attempts: WeaknessAttempt[] = [
      ...Array.from({ length: 2 }, (_, i) => at(20 + i, i % 2 === 0 ? ['Command words'] : [])),
      ...Array.from({ length: 20 }, (_, i) => at((i % 13) + 1, i % 2 === 0 ? ['Command words'] : [])),
    ];

    expect(rankWeaknesses(attempts, { now: NOW })[0].trend).toBe('persistent');
  });

  it('marks a first-time weakness as new rather than worsening', () => {
    const attempts: WeaknessAttempt[] = [at(20, []), at(2, ['Significant figures'])];
    expect(rankWeaknesses(attempts, { now: NOW })[0].trend).toBe('new');
  });

  it('counts a tag once per attempt even if repeated', () => {
    const ranked = rankWeaknesses([at(1, ['Osmosis', 'osmosis.', 'Osmosis'])], { now: NOW });
    expect(ranked.filter((w) => w.tag === 'Osmosis')).toHaveLength(1);
    expect(ranked[0].count).toBe(1);
  });

  it('collects every subject a weakness spans', () => {
    const ranked = rankWeaknesses(
      [at(1, ['Data analysis'], 'biology'), at(2, ['Data analysis'], 'chemistry')],
      { now: NOW }
    );
    expect(ranked[0].subjects.sort()).toEqual(['biology', 'chemistry']);
  });

  it('reports how long ago a weakness was last seen', () => {
    expect(rankWeaknesses([at(5, ['Titration'])], { now: NOW })[0].lastSeenDaysAgo).toBe(5);
  });

  it('ignores undated attempts and empty tags', () => {
    const attempts: WeaknessAttempt[] = [
      { createdAt: null, subject: 'biology', tags: ['Ghost'] },
      { createdAt: 'not-a-date', subject: 'biology', tags: ['Ghost'] },
      at(1, ['', '   ']),
    ];
    expect(rankWeaknesses(attempts, { now: NOW })).toEqual([]);
  });

  it('respects the limit', () => {
    const attempts = [at(1, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])];
    expect(rankWeaknesses(attempts, { now: NOW, limit: 3 })).toHaveLength(3);
  });

  it('does not let a future-dated attempt outscore a current one', () => {
    const ranked = rankWeaknesses([at(-30, ['Future']), at(0, ['Today'])], { now: NOW });
    expect(ranked[0].score).toBeCloseTo(ranked[1].score);
  });
});

describe('trendLabel', () => {
  it('labels every trend', () => {
    expect(trendLabel('worsening')).toBe('Getting worse');
    expect(trendLabel('improving')).toBe('Improving');
    expect(trendLabel('new')).toBe('New');
    expect(trendLabel('persistent')).toBe('Still recurring');
  });
});
