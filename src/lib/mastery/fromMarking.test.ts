import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('../curriculum/cache', () => ({ cachedResolveTopic: vi.fn() }));
vi.mock('../ai/classifySubtopic', () => ({ classifyQuestionsToSubtopics: vi.fn() }));
vi.mock('./record', () => ({ recordMasteryEvents: vi.fn() }));

import { cachedResolveTopic as resolveTopic } from '../curriculum/cache';
import { classifyQuestionsToSubtopics } from '../ai/classifySubtopic';
import { recordMasteryEvents, type EvidenceInput } from './record';
import { recordMarkingEvidence } from './fromMarking';

const admin = {} as SupabaseClient;
const SCOPE = {
  subject: 'Chemistry',
  examBoard: 'AQA',
  examType: 'GCSE',
  topic: 'Bonding',
  source: 'exam_practice' as const,
};

const SUBTOPICS = [
  { id: 'st-ionic', name: 'Ionic bonding' },
  { id: 'st-covalent', name: 'Covalent bonding' },
];

const recorded = (): EvidenceInput[] =>
  vi.mocked(recordMasteryEvents).mock.calls.at(-1)?.[2] ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveTopic).mockResolvedValue({
    specificationId: 's1',
    specificationName: 'AQA GCSE Chemistry',
    tier: 'Higher',
    topicId: 't1',
    subtopics: SUBTOPICS,
    ambiguousSpecification: false,
  });
  vi.mocked(classifyQuestionsToSubtopics).mockResolvedValue({ subtopicIds: [] });
  vi.mocked(recordMasteryEvents).mockResolvedValue({ eventsWritten: 0, subtopicsUpdated: 0, errors: [] });
});

describe('recordMarkingEvidence', () => {
  it('turns marks into a 0..1 outcome and keeps the first weakness tag', async () => {
    await recordMarkingEvidence(admin, 'user-1', {
      ...SCOPE,
      sourceId: 'attempt-1',
      questions: [{ question: 'Ionic bonding', marks: 4 }],
      markedAnswers: [{ questionIndex: 0, marksAwarded: 3, maxMarks: 4, weaknessTags: ['lattice', 'charges'] }],
    });

    expect(recorded()).toEqual([
      {
        subtopicId: 'st-ionic',
        outcome: 0.75,
        source: 'exam_practice',
        sourceId: 'attempt-1',
        marksAwarded: 3,
        marksAvailable: 4,
        rawWeaknessText: 'lattice',
      },
    ]);
  });

  it('carries the source through so mocks can be weighted above practice', async () => {
    await recordMarkingEvidence(admin, 'user-1', {
      ...SCOPE,
      source: 'mock',
      questions: [{ question: 'Ionic bonding', marks: 2 }],
      markedAnswers: [{ questionIndex: 0, marksAwarded: 2, maxMarks: 2 }],
    });

    expect(recorded()[0].source).toBe('mock');
  });

  it('matches answers on questionIndex rather than array position', async () => {
    await recordMarkingEvidence(admin, 'user-1', {
      ...SCOPE,
      questions: [
        { question: 'Ionic bonding', marks: 2 },
        { question: 'Covalent bonding', marks: 2 },
      ],
      // Deliberately out of order.
      markedAnswers: [
        { questionIndex: 1, marksAwarded: 0, maxMarks: 2 },
        { questionIndex: 0, marksAwarded: 2, maxMarks: 2 },
      ],
    });

    expect(recorded()).toEqual([
      expect.objectContaining({ subtopicId: 'st-ionic', outcome: 1 }),
      expect.objectContaining({ subtopicId: 'st-covalent', outcome: 0 }),
    ]);
  });

  it('falls back to the question marks when the answer omits maxMarks', async () => {
    await recordMarkingEvidence(admin, 'user-1', {
      ...SCOPE,
      questions: [{ question: 'Ionic bonding', marks: 5 }],
      markedAnswers: [{ questionIndex: 0, marksAwarded: 1 }],
    });

    expect(recorded()[0]).toMatchObject({ outcome: 0.2, marksAvailable: 5 });
  });

  it('skips questions worth no marks', async () => {
    await recordMarkingEvidence(admin, 'user-1', {
      ...SCOPE,
      questions: [{ question: 'Ionic bonding', marks: 0 }],
      markedAnswers: [{ questionIndex: 0, marksAwarded: 0, maxMarks: 0 }],
    });

    expect(recordMasteryEvents).not.toHaveBeenCalled();
  });

  it('records nothing when the topic does not resolve', async () => {
    vi.mocked(resolveTopic).mockResolvedValue(null);

    await recordMarkingEvidence(admin, 'user-1', {
      ...SCOPE,
      questions: [{ question: 'Ionic bonding', marks: 4 }],
      markedAnswers: [{ questionIndex: 0, marksAwarded: 4, maxMarks: 4 }],
    });

    expect(recordMasteryEvents).not.toHaveBeenCalled();
  });

  it('leaves unclassifiable questions out rather than guessing a subtopic', async () => {
    vi.mocked(classifyQuestionsToSubtopics).mockResolvedValue({ subtopicIds: [null] });

    await recordMarkingEvidence(admin, 'user-1', {
      ...SCOPE,
      questions: [{ question: 'Describe an unrelated process', marks: 6 }],
      markedAnswers: [{ questionIndex: 0, marksAwarded: 3, maxMarks: 6 }],
    });

    expect(recordMasteryEvents).not.toHaveBeenCalled();
  });

  it('swallows a classifier failure rather than breaking the marking response', async () => {
    vi.mocked(classifyQuestionsToSubtopics).mockRejectedValue(new Error('model down'));

    await expect(
      recordMarkingEvidence(admin, 'user-1', {
        ...SCOPE,
        questions: [{ question: 'Describe an unrelated process', marks: 6 }],
        markedAnswers: [{ questionIndex: 0, marksAwarded: 3, maxMarks: 6 }],
      })
    ).resolves.toBeUndefined();
  });
});
