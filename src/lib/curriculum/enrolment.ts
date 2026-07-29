import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Does this student actually study the specification a curriculum node sits in?
 *
 * The curriculum tables are public reference data — every student can read every
 * subtopic of every specification, which is correct, and which means a node id
 * on its own proves nothing about who should be generating evidence against it.
 *
 * That matters because the routes below this guard create rows in
 * `student_subtopic_mastery`, and those rows are what the planner and the review
 * queue draw from. Without the check, a crafted request could quietly fill a
 * student's own queue with material from a course they do not take — not a
 * privilege escalation, but a corrupted queue is a broken feature all the same.
 */

const studentStudies = async (
  db: SupabaseClient,
  userId: string,
  specificationId: string | null | undefined
): Promise<boolean> => {
  if (!specificationId) return false;
  const { data } = await db
    .from('student_subjects')
    .select('id')
    .eq('user_id', userId)
    .eq('specification_id', specificationId)
    .maybeSingle();
  return Boolean(data);
};

/** True when the student studies the specification this topic belongs to. */
export async function studentStudiesTopic(
  db: SupabaseClient,
  userId: string,
  topicId: string
): Promise<boolean> {
  if (!topicId) return false;
  const { data } = await db
    .from('topics')
    .select('specification_id')
    .eq('id', topicId)
    .maybeSingle();

  return studentStudies(db, userId, (data as { specification_id: string | null } | null)?.specification_id);
}

/** True when the student studies the specification this subtopic belongs to. */
export async function studentStudiesSubtopic(
  db: SupabaseClient,
  userId: string,
  subtopicId: string
): Promise<boolean> {
  if (!subtopicId) return false;
  const { data } = await db
    .from('subtopics')
    .select('topics!inner(specification_id)')
    .eq('id', subtopicId)
    .maybeSingle();

  const row = data as unknown as { topics: { specification_id: string } | null } | null;
  return studentStudies(db, userId, row?.topics?.specification_id);
}
