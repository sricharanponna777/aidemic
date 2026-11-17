import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyEvidence, initialMasteryState } from '../mastery';
import { rebuildSubtopicMastery } from './record';

type EventRow = { outcome: number; weight: number; created_at: string };

/** Just enough of the client for rebuildSubtopicMastery: one select chain, one upsert. */
const fakeAdmin = (events: EventRow[]) => {
  const upserts: Record<string, unknown>[] = [];
  const chain = {
    eq: () => chain,
    order: async () => ({ data: events, error: null }),
  };
  const client = {
    from: (table: string) =>
      table === 'mastery_events'
        ? { select: () => chain }
        : {
            upsert: async (row: Record<string, unknown>) => {
              upserts.push(row);
              return { error: null };
            },
          },
  };
  return { admin: client as unknown as SupabaseClient, upserts };
};

describe('rebuildSubtopicMastery', () => {
  const practice: EventRow = { outcome: 0.9, weight: 1.2, created_at: '2026-11-10T09:00:00.000Z' };
  const misclick: EventRow = { outcome: 1, weight: 0.2, created_at: '2026-11-17T09:00:00.000Z' };

  it('puts the state back to what it was before a withdrawn rating', async () => {
    const before = applyEvidence(initialMasteryState(), { outcome: practice.outcome, weight: practice.weight, at: practice.created_at });
    const after = applyEvidence(before, { outcome: misclick.outcome, weight: misclick.weight, at: misclick.created_at });
    expect(after.evidenceCount).toBe(2);

    // The misclick's event has been deleted, so only the practice event is left to replay.
    const { admin, upserts } = fakeAdmin([practice]);
    expect(await rebuildSubtopicMastery(admin, 'user', 'subtopic')).toBe(1);
    expect(upserts[0]).toMatchObject({
      strength: before.strength,
      stability: before.stability,
      confidence: before.confidence,
      evidence_count: 1,
      last_seen_at: before.lastSeenAt,
      due_at: before.dueAt,
    });
  });

  it('returns to a zero-evidence state when the withdrawn rating was the only evidence', async () => {
    const { admin, upserts } = fakeAdmin([]);
    expect(await rebuildSubtopicMastery(admin, 'user', 'subtopic')).toBe(0);
    expect(upserts[0]).toMatchObject({ evidence_count: 0, last_seen_at: null, due_at: null });
  });
});
