import { describe, expect, it } from 'vitest';
import { describeMasteryCoverage, masteryCoverage } from './gradeFromMastery';
import type { SubtopicMastery } from '@/lib/mastery/read';
import type { MasteryBand } from '@/lib/mastery';

const row = (band: MasteryBand, retrievability: number, id = 'sub'): SubtopicMastery => ({
  subtopicId: id,
  subtopicName: 'Ionic bonding',
  topicId: 'topic',
  topicName: 'Bonding',
  state: {
    strength: retrievability,
    stability: 1,
    confidence: band === 'unknown' ? 0.1 : 0.8,
    evidenceCount: band === 'unknown' ? 0 : 4,
    lastSeenAt: null,
    dueAt: null,
  },
  selfRating: null,
  retrievability,
  band,
  scope: { subject: 'chemistry', examBoard: 'aqa', examType: 'gcse', specName: 'Spec', specTier: null },
});

describe('masteryCoverage', () => {
  it('reports nothing measured when there are no rows', () => {
    expect(masteryCoverage([], 300)).toEqual({
      covered: 0,
      total: 300,
      coverage: 0,
      meanRetrievability: 0,
    });
  });

  it('excludes unknown-band rows from coverage', () => {
    const result = masteryCoverage(
      [row('unknown', 0.2, 'a'), row('weak', 0.3, 'b'), row('secure', 0.7, 'c')],
      100
    );
    expect(result.covered).toBe(2);
    expect(result.coverage).toBeCloseTo(0.02);
  });

  it('averages retrievability over covered rows only', () => {
    const result = masteryCoverage([row('unknown', 0, 'a'), row('secure', 0.8, 'b')], 10);
    expect(result.meanRetrievability).toBeCloseTo(0.8);
  });

  it('reports zero coverage when the specification size is unknown', () => {
    const result = masteryCoverage([row('secure', 0.8)], 0);
    expect(result.covered).toBe(1);
    expect(result.total).toBe(0);
    expect(result.coverage).toBe(0);
  });

  it('caps coverage at 100% when stale rows outnumber the specification', () => {
    const rows = [row('secure', 0.8, 'a'), row('secure', 0.8, 'b'), row('secure', 0.8, 'c')];
    expect(masteryCoverage(rows, 2).coverage).toBe(1);
  });
});

describe('describeMasteryCoverage', () => {
  it('describes real coverage', () => {
    const result = masteryCoverage([row('secure', 0.8, 'a'), row('weak', 0.2, 'b')], 10);
    expect(describeMasteryCoverage(result)).toBe(
      'measured on 2 of 10 subtopics (20% of the specification)'
    );
  });

  it('says nothing when nothing has been measured', () => {
    expect(describeMasteryCoverage(masteryCoverage([], 300))).toBeNull();
  });

  it('says nothing when the specification size is unknown', () => {
    expect(describeMasteryCoverage(masteryCoverage([row('secure', 0.8)], 0))).toBeNull();
  });
});
