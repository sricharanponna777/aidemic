import { describe, expect, it } from 'vitest';
import { comparePracticePriority, toSubtopicMastery, type SubtopicMastery } from './read';

const NOW = new Date('2026-07-28T00:00:00.000Z');
const at = (days: number) => new Date(NOW.getTime() + days * 86400000).toISOString();

/** A joined row as PostgREST actually returns it — numerics as strings. */
const joinRow = (overrides: Record<string, unknown> = {}) => ({
  subtopic_id: 'st-1',
  strength: '0.82',
  stability: '4.5',
  confidence: '0.61',
  self_rating: null,
  evidence_count: 3,
  last_seen_at: at(-1),
  due_at: at(3),
  subtopics: {
    id: 'st-1',
    name: 'Ionic bonding',
    topics: {
      id: 't-1',
      name: 'Bonding',
      specifications: {
        name: 'AQA GCSE Chemistry',
        tier: 'Higher',
        subjects: {
          name: 'Chemistry',
          exam_boards: { name: 'AQA', qualifications: { name: 'GCSE' } },
        },
      },
    },
  },
  ...overrides,
});

describe('toSubtopicMastery', () => {
  it('coerces string numerics into a usable state', () => {
    const row = toSubtopicMastery(joinRow() as never, NOW);

    expect(row?.state.strength).toBe(0.82);
    expect(row?.state.stability).toBe(4.5);
    expect(row?.state.confidence).toBe(0.61);
    expect(row?.state.evidenceCount).toBe(3);
  });

  it('lowercases the scope keys the generation routes expect', () => {
    expect(toSubtopicMastery(joinRow() as never, NOW)?.scope).toEqual({
      subject: 'chemistry',
      examBoard: 'aqa',
      examType: 'gcse',
      specName: 'AQA GCSE Chemistry',
      specTier: 'Higher',
    });
  });

  it('decays strength to the read time rather than reporting it raw', () => {
    const row = toSubtopicMastery(joinRow() as never, NOW);

    expect(row?.retrievability).toBeLessThan(0.82);
    expect(row?.band).toBe('secure');
  });

  it('reports thin evidence as unknown, not weak', () => {
    const row = toSubtopicMastery(
      joinRow({ strength: '0.1', confidence: '0.12', evidence_count: 1 }) as never,
      NOW
    );

    expect(row?.band).toBe('unknown');
  });

  it('carries a self-rating through when one is set', () => {
    expect(toSubtopicMastery(joinRow({ self_rating: 'amber' }) as never, NOW)?.selfRating).toBe('amber');
  });

  it('drops rows whose curriculum join came back incomplete', () => {
    expect(toSubtopicMastery(joinRow({ subtopics: null }) as never, NOW)).toBeNull();
    expect(
      toSubtopicMastery(joinRow({ subtopics: { id: 'st-1', name: 'X', topics: null } }) as never, NOW)
    ).toBeNull();
  });
});

const entry = (over: Partial<SubtopicMastery> & { dueAt?: string | null }): SubtopicMastery =>
  ({
    subtopicId: over.subtopicId ?? 'st',
    subtopicName: 'Sub',
    topicId: 't',
    topicName: 'Topic',
    // `in` rather than ??, so an explicit null stays null.
    state: {
      strength: 0.5,
      stability: 1,
      confidence: 0.9,
      evidenceCount: 4,
      lastSeenAt: at(-1),
      dueAt: 'dueAt' in over ? over.dueAt : at(1),
    },
    selfRating: null,
    retrievability: over.retrievability ?? 0.5,
    band: over.band ?? 'developing',
    scope: { subject: 'chemistry', examBoard: 'aqa', examType: 'gcse', specName: 'Spec', specTier: null },
  }) as SubtopicMastery;

describe('comparePracticePriority', () => {
  it('puts the more overdue subtopic first', () => {
    const older = entry({ subtopicId: 'older', dueAt: at(-5) });
    const newer = entry({ subtopicId: 'newer', dueAt: at(-1) });

    expect([newer, older].sort(comparePracticePriority)[0].subtopicId).toBe('older');
  });

  it('breaks ties on weakest retrievability', () => {
    const strong = entry({ subtopicId: 'strong', dueAt: at(-1), retrievability: 0.8 });
    const weak = entry({ subtopicId: 'weak', dueAt: at(-1), retrievability: 0.2 });

    expect([strong, weak].sort(comparePracticePriority)[0].subtopicId).toBe('weak');
  });

  it('sorts unknown last however overdue it looks', () => {
    // Untested material must not crowd out material we know is weak.
    const unknown = entry({ subtopicId: 'unknown', dueAt: at(-99), band: 'unknown', retrievability: 0 });
    const weak = entry({ subtopicId: 'weak', dueAt: at(1), band: 'weak', retrievability: 0.3 });

    expect([unknown, weak].sort(comparePracticePriority).map((row) => row.subtopicId)).toEqual([
      'weak',
      'unknown',
    ]);
  });

  it('treats a missing due date as never due', () => {
    const scheduled = entry({ subtopicId: 'scheduled', dueAt: at(9) });
    const unscheduled = entry({ subtopicId: 'unscheduled', dueAt: null });

    expect([unscheduled, scheduled].sort(comparePracticePriority)[0].subtopicId).toBe('scheduled');
  });
});
