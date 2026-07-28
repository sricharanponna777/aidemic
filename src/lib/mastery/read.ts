import type { SupabaseClient } from '@supabase/supabase-js';
import { isDue, masteryBand, retrievabilityAt, type MasteryBand, type MasteryState } from '../mastery';
import { rowToState, type MasteryRow } from './record';

/**
 * The read side of the Learning Spine.
 *
 * Writes go through the service role (see record.ts); reads do not need it.
 * Both surfaces that consume this -- the student practice queue and the teacher
 * class heatmap -- are covered by policies that already exist on
 * `student_subtopic_mastery`: `auth.uid() = user_id` for a student reading their
 * own, `is_teacher_of_student(user_id)` for a teacher reading a roster. So this
 * module takes whichever client the caller has and lets RLS do the scoping.
 *
 * Every function swallows its own errors and returns empty. A mastery read is
 * an enhancement on both surfaces, never the reason a page exists, so a failed
 * query must degrade to "no data" rather than a crashed dashboard. An empty
 * result is also the signal callers use to fall back to the pre-spine path.
 */

/** Enough free-text context to regenerate practice on a subtopic. */
export interface SubtopicScope {
  subject: string;
  examBoard: string;
  examType: string;
  specName: string;
  specTier: string | null;
}

/** A subtopic with its curriculum context and one student's belief state. */
export interface SubtopicMastery {
  subtopicId: string;
  subtopicName: string;
  topicId: string;
  topicName: string;
  state: MasteryState;
  selfRating: 'red' | 'amber' | 'green' | null;
  /** Strength decayed to `at`. Display this, never `state.strength`. */
  retrievability: number;
  band: MasteryBand;
  scope: SubtopicScope;
}

/** Rows beyond this are not worth fetching to pick a handful to practise. */
const MAX_ROWS = 200;

const MASTERY_SELECT = `
  subtopic_id, strength, stability, confidence, self_rating, evidence_count, last_seen_at, due_at,
  subtopics!inner (
    id, name,
    topics!inner (
      id, name,
      specifications!inner (
        name, tier,
        subjects!inner (
          name,
          exam_boards!inner ( name, qualifications!inner ( name ) )
        )
      )
    )
  )
`;

type MasteryJoinRow = MasteryRow & {
  self_rating: 'red' | 'amber' | 'green' | null;
  subtopics: {
    id: string;
    name: string;
    topics: {
      id: string;
      name: string;
      specifications: {
        name: string;
        tier: string | null;
        subjects: {
          name: string;
          exam_boards: { name: string; qualifications: { name: string } | null } | null;
        } | null;
      } | null;
    } | null;
  } | null;
};

/**
 * Shape a joined row into a SubtopicMastery. Exported for tests: numerics come
 * back from Postgres as strings, and that coercion is worth pinning down.
 */
export function toSubtopicMastery(row: MasteryJoinRow, at: Date): SubtopicMastery | null {
  const subtopic = row.subtopics;
  const topic = subtopic?.topics;
  const spec = topic?.specifications;
  if (!subtopic || !topic || !spec) return null;

  const subject = spec.subjects;
  const board = subject?.exam_boards;
  const state = rowToState(row);

  return {
    subtopicId: subtopic.id,
    subtopicName: subtopic.name,
    topicId: topic.id,
    topicName: topic.name,
    state,
    selfRating: row.self_rating ?? null,
    retrievability: retrievabilityAt(state, at),
    band: masteryBand(state, at),
    scope: {
      // Lowercased to match the keys the generation routes and subject config
      // expect, the same normalisation mapStudentSubjectRow applies.
      subject: (subject?.name ?? '').toLowerCase(),
      examBoard: (board?.name ?? '').toLowerCase(),
      examType: (board?.qualifications?.name ?? '').toLowerCase(),
      specName: spec.name,
      specTier: spec.tier,
    },
  };
}

/**
 * One student's mastery, soonest-due first.
 *
 * Returns [] when the student has no spine data yet, which callers should read
 * as "fall back to the pre-spine weakness-tag path" rather than "no weaknesses".
 */
export async function readStudentMastery(
  db: SupabaseClient,
  userId: string,
  options: { limit?: number; at?: Date } = {}
): Promise<SubtopicMastery[]> {
  const at = options.at ?? new Date();
  try {
    const { data, error } = await db
      .from('student_subtopic_mastery')
      .select(MASTERY_SELECT)
      .eq('user_id', userId)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(options.limit ?? MAX_ROWS);

    if (error) {
      console.error('[spine] readStudentMastery failed', error.message);
      return [];
    }

    return ((data ?? []) as unknown as MasteryJoinRow[])
      .map((row) => toSubtopicMastery(row, at))
      .filter((row): row is SubtopicMastery => row !== null);
  } catch (err) {
    console.error('[spine] readStudentMastery failed', err);
    return [];
  }
}

/**
 * Practice ordering: overdue first, then weakest.
 *
 * 'unknown' sorts last on purpose. A subtopic with too little evidence to have
 * an opinion about is not the same as one we know is weak, and putting it at the
 * front would fill the queue with noise the moment a student adds a subject.
 */
export function comparePracticePriority(a: SubtopicMastery, b: SubtopicMastery): number {
  const unknownA = a.band === 'unknown' ? 1 : 0;
  const unknownB = b.band === 'unknown' ? 1 : 0;
  if (unknownA !== unknownB) return unknownA - unknownB;

  const dueA = a.state.dueAt ? Date.parse(a.state.dueAt) : Number.POSITIVE_INFINITY;
  const dueB = b.state.dueAt ? Date.parse(b.state.dueAt) : Number.POSITIVE_INFINITY;
  if (dueA !== dueB) return dueA - dueB;

  return a.retrievability - b.retrievability;
}

/** The next subtopics to practise: due first, then weakest. */
export async function readDueSubtopics(
  db: SupabaseClient,
  userId: string,
  options: { limit?: number; at?: Date } = {}
): Promise<SubtopicMastery[]> {
  const at = options.at ?? new Date();
  const all = await readStudentMastery(db, userId, { at });

  const due = all.filter((row) => isDue(row.state, at));
  // Nothing is due yet, so fall back to the weakest known material rather than
  // telling a student with real gaps that there is nothing to do.
  const candidates = due.length > 0 ? due : all.filter((row) => row.band !== 'unknown');

  return candidates.sort(comparePracticePriority).slice(0, options.limit ?? candidates.length);
}

export interface ClassMasteryCell {
  userId: string;
  subtopicId: string;
  state: MasteryState;
  retrievability: number;
  band: MasteryBand;
}

export interface ClassMastery {
  /** Every subtopic of the requested topic, in specification order. */
  subtopics: { subtopicId: string; subtopicName: string }[];
  /** Keyed `${userId}:${subtopicId}`. A missing key means no evidence at all. */
  cells: Map<string, ClassMasteryCell>;
}

/** Topics of a class's specification, in specification order. */
export async function readSpecificationTopics(
  db: SupabaseClient,
  specificationId: string
): Promise<{ topicId: string; topicName: string }[]> {
  if (!specificationId) return [];
  try {
    const { data } = await db
      .from('topics')
      .select('id, name')
      .eq('specification_id', specificationId)
      .order('order_index');

    return ((data ?? []) as { id: string; name: string }[]).map((row) => ({
      topicId: row.id,
      topicName: row.name,
    }));
  } catch (err) {
    console.error('[spine] readSpecificationTopics failed', err);
    return [];
  }
}

/**
 * One topic's subtopics against a roster, for the class heatmap.
 *
 * Reads through the `is_teacher_of_student` policy, so a teacher only ever sees
 * the students they actually teach however wide a `studentIds` list is passed.
 */
export async function readClassMastery(
  db: SupabaseClient,
  params: { topicId: string; studentIds: string[]; at?: Date }
): Promise<ClassMastery> {
  const empty: ClassMastery = { subtopics: [], cells: new Map() };
  const { topicId, studentIds } = params;
  const at = params.at ?? new Date();
  if (!topicId || studentIds.length === 0) return empty;

  try {
    const { data: subtopicData } = await db
      .from('subtopics')
      .select('id, name')
      .eq('topic_id', topicId)
      .order('order_index');

    const subtopicRows = (subtopicData ?? []) as { id: string; name: string }[];
    if (subtopicRows.length === 0) return empty;

    const wanted = new Set(subtopicRows.map((row) => row.id));

    // Deliberately not filtered by subtopic: a student has few enough mastery
    // rows that narrowing in JS beats a URL carrying hundreds of UUIDs.
    const { data: masteryData, error } = await db
      .from('student_subtopic_mastery')
      .select('user_id, subtopic_id, strength, stability, confidence, evidence_count, last_seen_at, due_at')
      .in('user_id', studentIds);

    if (error) {
      console.error('[spine] readClassMastery failed', error.message);
      return empty;
    }

    const cells = new Map<string, ClassMasteryCell>();
    for (const row of (masteryData ?? []) as (MasteryRow & { user_id: string })[]) {
      if (!wanted.has(row.subtopic_id)) continue;
      const state = rowToState(row);
      cells.set(`${row.user_id}:${row.subtopic_id}`, {
        userId: row.user_id,
        subtopicId: row.subtopic_id,
        state,
        retrievability: retrievabilityAt(state, at),
        band: masteryBand(state, at),
      });
    }

    return {
      subtopics: subtopicRows.map((row) => ({ subtopicId: row.id, subtopicName: row.name })),
      cells,
    };
  } catch (err) {
    console.error('[spine] readClassMastery failed', err);
    return empty;
  }
}
