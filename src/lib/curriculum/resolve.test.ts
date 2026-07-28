import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveTopic } from './resolve';

/**
 * A minimal stand-in for the PostgREST query builder.
 *
 * The behaviour under test is partly *which filters get issued* -- the
 * specifications lookup used to read the whole table and filter in JS -- so the
 * stub records every call rather than only returning rows.
 */
type Call = { table: string; filters: [string, string][] };

const stubClient = (tables: Record<string, unknown[]>, calls: Call[] = []) => {
  const db = {
    from(table: string) {
      const call: Call = { table, filters: [] };
      calls.push(call);
      const builder = {
        select: () => builder,
        order: () => builder,
        eq: (column: string, value: string) => {
          call.filters.push([`eq:${column}`, value]);
          return builder;
        },
        in: (column: string, values: string[]) => {
          call.filters.push([`in:${column}`, values.join(',')]);
          return builder;
        },
        ilike: (column: string, value: string) => {
          call.filters.push([`ilike:${column}`, value]);
          return builder;
        },
        then: (resolve: (value: { data: unknown[] }) => unknown) =>
          resolve({ data: tables[table] ?? [] }),
      };
      return builder;
    },
  };
  return db as unknown as SupabaseClient;
};

const spec = (id: string, name: string, tier: string | null) => ({
  id,
  name,
  tier,
  subjects: { name: 'Chemistry', exam_boards: { name: 'AQA', qualifications: { name: 'GCSE' } } },
});

const SCOPE = { subject: 'chemistry', examBoard: 'AQA', examType: 'GCSE' };

describe('resolveTopic', () => {
  it('pushes subject, board and qualification into the query', async () => {
    const calls: Call[] = [];
    await resolveTopic(
      stubClient(
        {
          specifications: [spec('s1', 'AQA GCSE Chemistry', 'Higher')],
          topics: [{ id: 't1', name: 'Bonding', specification_id: 's1' }],
          subtopics: [{ id: 'st1', name: 'Ionic bonding' }],
        },
        calls
      ),
      SCOPE,
      'Bonding'
    );

    const specCall = calls.find((call) => call.table === 'specifications');
    expect(specCall?.filters).toEqual([
      ['ilike:subjects.name', '%chemistry%'],
      ['ilike:subjects.exam_boards.name', 'AQA'],
      ['ilike:subjects.exam_boards.qualifications.name', 'GCSE'],
    ]);
  });

  it('escapes LIKE metacharacters so a subject cannot act as a pattern', async () => {
    const calls: Call[] = [];
    await resolveTopic(stubClient({ specifications: [] }, calls), { ...SCOPE, subject: '100%_x' }, 'Bonding');

    expect(calls[0].filters[0]).toEqual(['ilike:subjects.name', '%100\\%\\_x%']);
  });

  it('prefers Higher tier when the scope does not name one', async () => {
    const resolved = await resolveTopic(
      stubClient({
        specifications: [spec('s1', 'AQA GCSE Chemistry', 'Foundation'), spec('s2', 'AQA GCSE Chemistry', 'Higher')],
        topics: [
          { id: 't1', name: 'Bonding', specification_id: 's1' },
          { id: 't2', name: 'Bonding', specification_id: 's2' },
        ],
        subtopics: [{ id: 'st1', name: 'Ionic bonding' }],
      }),
      SCOPE,
      'Bonding'
    );

    expect(resolved?.specificationId).toBe('s2');
    expect(resolved?.tier).toBe('Higher');
    expect(resolved?.ambiguousSpecification).toBe(true);
  });

  it('honours an explicit tier over the Higher default', async () => {
    const resolved = await resolveTopic(
      stubClient({
        specifications: [spec('s1', 'AQA GCSE Chemistry', 'Foundation'), spec('s2', 'AQA GCSE Chemistry', 'Higher')],
        topics: [
          { id: 't1', name: 'Bonding', specification_id: 's1' },
          { id: 't2', name: 'Bonding', specification_id: 's2' },
        ],
        subtopics: [{ id: 'st1', name: 'Ionic bonding' }],
      }),
      { ...SCOPE, tier: 'Foundation' },
      'Bonding'
    );

    expect(resolved?.specificationId).toBe('s1');
  });

  it('ignores specifications that do not contain the named topic', async () => {
    const resolved = await resolveTopic(
      stubClient({
        specifications: [spec('s1', 'AQA GCSE Chemistry', 'Foundation'), spec('s2', 'AQA GCSE Chemistry', 'Higher')],
        // Only the Foundation spec has it, so Higher must not win here.
        topics: [{ id: 't1', name: 'Bonding', specification_id: 's1' }],
        subtopics: [{ id: 'st1', name: 'Ionic bonding' }],
      }),
      SCOPE,
      'Bonding'
    );

    expect(resolved?.specificationId).toBe('s1');
    expect(resolved?.ambiguousSpecification).toBe(false);
  });

  it('returns null rather than guessing when the topic is unknown', async () => {
    const resolved = await resolveTopic(
      stubClient({
        specifications: [spec('s1', 'AQA GCSE Chemistry', 'Higher')],
        topics: [{ id: 't1', name: 'Bonding', specification_id: 's1' }],
      }),
      SCOPE,
      'Quantitative chemistry'
    );

    expect(resolved).toBeNull();
  });

  it('returns null for an empty topic name without querying', async () => {
    const calls: Call[] = [];
    expect(await resolveTopic(stubClient({}, calls), SCOPE, '   ')).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
