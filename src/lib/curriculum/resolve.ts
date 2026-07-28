import type { SupabaseClient } from '@supabase/supabase-js';
import { pickBestSubtopic, type SubtopicCandidate } from './subtopicMatch';

/**
 * Resolving free-text attempt metadata onto curriculum IDs.
 *
 * `exam_practice_attempts` stores `subject`, `exam_board`, `exam_type` and
 * `topic` as free text ("chemistry", "aqa", "gcse", "Bonding, structure and
 * properties of matter"). The Learning Spine needs a `subtopic_id`. This module
 * is the bridge.
 *
 * The scoping rule that matters: a resolution MUST land inside exactly one
 * specification. AQA GCSE Chemistry exists as separate Foundation, Higher and
 * Combined-Science rows, each with its own copy of "Bonding, structure and
 * properties of matter" and its own subtopic IDs. Resolving loosely would
 * scatter one student's evidence across tier variants, so no single node ever
 * accumulates enough to be worth reading — the same fragmentation the spine
 * exists to eliminate, one level up.
 *
 * Where the tier is unknown we prefer Higher, which is the larger superset of
 * content, and record the ambiguity for the caller to log.
 */

export interface CurriculumScope {
  subject: string;
  examBoard: string;
  /** 'gcse' | 'a-level' — matched against qualifications.name. */
  examType: string;
  tier?: string | null;
}

export interface ResolvedTopic {
  specificationId: string;
  specificationName: string;
  tier: string | null;
  topicId: string;
  subtopics: SubtopicCandidate[];
  /** True when more than one specification matched and we picked one. */
  ambiguousSpecification: boolean;
}

type SpecRow = {
  id: string;
  name: string;
  tier: string | null;
  subjects: {
    name: string;
    exam_boards: { name: string; qualifications: { name: string } | null } | null;
  } | null;
};

const norm = (value: string) => (value || '').trim().toLowerCase();

/** Escapes LIKE metacharacters so a subject name cannot act as a pattern. */
const like = (value: string) => (value || '').trim().replace(/[%_\\]/g, '\\$&');

/** Higher tier is the content superset, so it is the safer default. */
const preferTier = (rows: SpecRow[], tier?: string | null): SpecRow | undefined => {
  if (rows.length === 0) return undefined;
  if (tier) {
    const exact = rows.find((row) => norm(row.tier || '') === norm(tier));
    if (exact) return exact;
  }
  return rows.find((row) => norm(row.tier || '') === 'higher') ?? rows[0];
};

/**
 * Find the specification, topic and candidate subtopics for a free-text scope.
 * Returns null when nothing matches — callers must treat that as "unresolved"
 * and skip, never as "attribute it somewhere plausible".
 */
export async function resolveTopic(
  db: SupabaseClient,
  scope: CurriculumScope,
  topicName: string
): Promise<ResolvedTopic | null> {
  if (!topicName?.trim()) return null;

  // Filters are pushed into the query rather than applied in JS: this runs on
  // every marking run, and the unfiltered form reads the whole specifications
  // table with three joins. `ilike` without wildcards is case-insensitive
  // equality; the wrapping `%` on subject preserves the deliberate substring
  // match that lets "chemistry" find "Combined Science: Trilogy (Chemistry)".
  const { data: specData } = await db
    .from('specifications')
    .select('id, name, tier, subjects!inner(name, exam_boards!inner(name, qualifications!inner(name)))')
    .ilike('subjects.name', `%${like(scope.subject)}%`)
    .ilike('subjects.exam_boards.name', like(scope.examBoard))
    .ilike('subjects.exam_boards.qualifications.name', like(scope.examType));

  const specs = (specData ?? []) as unknown as SpecRow[];

  if (specs.length === 0) return null;

  // Only consider specifications that actually contain the named topic.
  const specIds = specs.map((row) => row.id);
  const { data: topicRows } = await db
    .from('topics')
    .select('id, name, specification_id')
    .in('specification_id', specIds);

  const matching = ((topicRows ?? []) as { id: string; name: string; specification_id: string }[])
    .filter((row) => norm(row.name) === norm(topicName));

  if (matching.length === 0) return null;

  const viable = specs.filter((row) => matching.some((t) => t.specification_id === row.id));
  const spec = preferTier(viable, scope.tier);
  if (!spec) return null;

  const topic = matching.find((row) => row.specification_id === spec.id);
  if (!topic) return null;

  const { data: subtopicRows } = await db
    .from('subtopics')
    .select('id, name')
    .eq('topic_id', topic.id)
    .order('order_index');

  return {
    specificationId: spec.id,
    specificationName: spec.name,
    tier: spec.tier,
    topicId: topic.id,
    subtopics: (subtopicRows ?? []) as SubtopicCandidate[],
    ambiguousSpecification: viable.length > 1,
  };
}

/**
 * Attribute each question to a subtopic using the lexical fast path.
 *
 * Questions that do not resolve confidently come back as null rather than being
 * placed somewhere plausible — those are the ones the LLM classifier should
 * handle, and until it does they are counted as unresolved, not guessed.
 */
export function attributeQuestions(
  subtopics: SubtopicCandidate[],
  questionTexts: string[]
): (string | null)[] {
  return questionTexts.map((text) => pickBestSubtopic(subtopics, text)?.id ?? null);
}
