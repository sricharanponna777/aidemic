import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// attributeQuestions is pure and doing its real lexical work is the point --
// only the DB-backed resolveTopic (now reached via the cache wrapper) is faked.
vi.mock('../curriculum/cache', () => ({ cachedResolveTopic: vi.fn() }));
vi.mock('../ai/classifySubtopic', () => ({ classifyQuestionsToSubtopics: vi.fn() }));
vi.mock('./record', () => ({ recordMasteryEvents: vi.fn() }));

import { cachedResolveTopic as resolveTopic } from '../curriculum/cache';
import { classifyQuestionsToSubtopics } from '../ai/classifySubtopic';
import { recordMasteryEvents, type EvidenceInput } from './record';
import { recordBlurtEvidence } from './fromBlurt';

const admin = {} as SupabaseClient;
const SCOPE = { subject: 'Chemistry', examBoard: 'AQA', examType: 'GCSE', topic: 'Bonding' };

const SUBTOPICS = [
  { id: 'st-ionic', name: 'Ionic bonding' },
  { id: 'st-covalent', name: 'Covalent bonding' },
  { id: 'st-metallic', name: 'Metallic bonding' },
];

/** The evidence handed to recordMasteryEvents on the most recent call. */
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
  // Nothing left for the classifier by default; the lexical pass matches these.
  vi.mocked(classifyQuestionsToSubtopics).mockResolvedValue({ subtopicIds: [] });
  vi.mocked(recordMasteryEvents).mockResolvedValue({ eventsWritten: 0, subtopicsUpdated: 0, errors: [] });
});

describe('recordBlurtEvidence', () => {
  it('records recalled points as passes and omissions as failures', async () => {
    await recordBlurtEvidence(admin, 'user-1', {
      ...SCOPE,
      covered: ['Ionic bonding'],
      missed: ['Covalent bonding'],
      misconceptions: [],
    });

    expect(recorded()).toEqual([
      { subtopicId: 'st-ionic', outcome: 1, source: 'blurt', rawWeaknessText: null },
      { subtopicId: 'st-covalent', outcome: 0, source: 'blurt', rawWeaknessText: 'Covalent bonding' },
    ]);
  });

  it('treats misconceptions as failures', async () => {
    await recordBlurtEvidence(admin, 'user-1', {
      ...SCOPE,
      covered: [],
      missed: [],
      misconceptions: ['Metallic bonding — said the electrons are fixed'],
    });

    expect(recorded()).toEqual([
      {
        subtopicId: 'st-metallic',
        outcome: 0,
        source: 'blurt',
        rawWeaknessText: 'Metallic bonding — said the electrons are fixed',
      },
    ]);
  });

  it('emits one event per subtopic however many points map to it', async () => {
    await recordBlurtEvidence(admin, 'user-1', {
      ...SCOPE,
      covered: ['Ionic bonding', 'Ionic bonding in sodium chloride'],
      missed: [],
      misconceptions: [],
    });

    expect(recorded()).toEqual([{ subtopicId: 'st-ionic', outcome: 1, source: 'blurt', rawWeaknessText: null }]);
  });

  it('drops a subtopic that was both recalled and missed', async () => {
    await recordBlurtEvidence(admin, 'user-1', {
      ...SCOPE,
      covered: ['Ionic bonding'],
      missed: ['Ionic bonding'],
      misconceptions: [],
    });

    expect(recordMasteryEvents).not.toHaveBeenCalled();
  });

  it('keeps the uncontradicted subtopics when another is contradictory', async () => {
    await recordBlurtEvidence(admin, 'user-1', {
      ...SCOPE,
      covered: ['Ionic bonding', 'Covalent bonding'],
      missed: ['Ionic bonding'],
      misconceptions: [],
    });

    expect(recorded()).toEqual([{ subtopicId: 'st-covalent', outcome: 1, source: 'blurt', rawWeaknessText: null }]);
  });

  it('falls back to the classifier for points the lexical pass misses', async () => {
    vi.mocked(classifyQuestionsToSubtopics).mockResolvedValue({ subtopicIds: ['st-metallic'] });

    await recordBlurtEvidence(admin, 'user-1', {
      ...SCOPE,
      covered: [],
      missed: ['Delocalised electrons carry charge through the lattice'],
      misconceptions: [],
    });

    expect(recorded()).toEqual([
      {
        subtopicId: 'st-metallic',
        outcome: 0,
        source: 'blurt',
        rawWeaknessText: 'Delocalised electrons carry charge through the lattice',
      },
    ]);
  });

  it('records nothing when the topic does not resolve', async () => {
    vi.mocked(resolveTopic).mockResolvedValue(null);

    await recordBlurtEvidence(admin, 'user-1', { ...SCOPE, covered: ['Ionic bonding'], missed: [], misconceptions: [] });

    expect(recordMasteryEvents).not.toHaveBeenCalled();
  });

  it('records nothing when no point can be attributed', async () => {
    vi.mocked(classifyQuestionsToSubtopics).mockResolvedValue({ subtopicIds: [null] });

    await recordBlurtEvidence(admin, 'user-1', {
      ...SCOPE,
      covered: ['Something entirely off-spec'],
      missed: [],
      misconceptions: [],
    });

    expect(recordMasteryEvents).not.toHaveBeenCalled();
  });

  it('swallows a classifier failure rather than breaking the review', async () => {
    vi.mocked(classifyQuestionsToSubtopics).mockRejectedValue(new Error('model down'));

    await expect(
      recordBlurtEvidence(admin, 'user-1', {
        ...SCOPE,
        covered: ['Delocalised electrons carry charge'],
        missed: [],
        misconceptions: [],
      })
    ).resolves.toBeUndefined();
  });
});
