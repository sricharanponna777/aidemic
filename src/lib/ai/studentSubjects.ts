import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserSubject } from '@/lib/ai/subjectConfig';

export const STUDENT_SUBJECT_SELECT = `
  id,
  specifications (
    name,
    tier,
    subjects (
      name,
      exam_boards (
        name,
        qualifications ( name )
      )
    )
  )
`;

export type StudentSubjectRow = {
  id: string;
  specifications: {
    name: string;
    tier: string | null;
    subjects: {
      name: string;
      exam_boards: {
        name: string;
        qualifications: { name: string } | null;
      } | null;
    } | null;
  } | null;
};

/** Maps a student_subjects row (joined through specifications/subjects/exam_boards/qualifications)
 * back into the lowercase-keyed UserSubject shape the rest of the app expects. */
export const mapStudentSubjectRow = (row: StudentSubjectRow): UserSubject => {
  const spec = row.specifications;
  const subject = spec?.subjects;
  const board = subject?.exam_boards;
  const qualification = board?.qualifications;

  return {
    id: row.id,
    subject: (subject?.name ?? '').toLowerCase() as UserSubject['subject'],
    exam_board: (board?.name ?? '').toLowerCase() as UserSubject['exam_board'],
    exam_type: (qualification?.name ?? '').toLowerCase() as UserSubject['exam_type'],
    spec_name: spec?.name ?? null,
    spec_tier: spec?.tier ?? null,
  };
};

/** Resolves the subjects.id for an exact (qualification, exam board, subject) combination by
 * walking down the seeded curriculum tree. Returns null if no match exists. */
const resolveSubjectId = async (
  supabase: SupabaseClient,
  params: { qualificationLabel: string; boardLabel: string; subjectLabel: string }
): Promise<string | null> => {
  const { qualificationLabel, boardLabel, subjectLabel } = params;

  const { data: examBoard } = await supabase
    .from('exam_boards')
    .select('id, qualifications!inner(name)')
    .eq('name', boardLabel)
    .eq('qualifications.name', qualificationLabel)
    .maybeSingle();
  if (!examBoard) return null;

  const { data: subjectRow } = await supabase
    .from('subjects')
    .select('id')
    .eq('exam_board_id', examBoard.id)
    .eq('name', subjectLabel)
    .maybeSingle();
  return subjectRow?.id ?? null;
};

/** Resolves the specification_id for an exact (qualification, exam board, subject, spec name, tier)
 * combination by walking down the seeded curriculum tree. Returns null if no match exists. */
export const resolveSpecificationId = async (
  supabase: SupabaseClient,
  params: {
    qualificationLabel: string;
    boardLabel: string;
    subjectLabel: string;
    specName: string;
    specTier?: string | null;
  }
): Promise<string | null> => {
  const { qualificationLabel, boardLabel, subjectLabel, specName, specTier } = params;

  const subjectId = await resolveSubjectId(supabase, { qualificationLabel, boardLabel, subjectLabel });
  if (!subjectId) return null;

  let specQuery = supabase
    .from('specifications')
    .select('id')
    .eq('subject_id', subjectId)
    .eq('name', specName);
  specQuery = specTier ? specQuery.eq('tier', specTier) : specQuery.is('tier', null);

  const { data: specRow } = await specQuery.maybeSingle();
  return specRow?.id ?? null;
};

/** Finds the tier a user saved for a given (qualification, exam board, subject) combination,
 * regardless of which specific specification they picked. Used to recover the Foundation/Higher
 * tier for a past exam_practice_attempts row (which still stores subject/board/type as free text). */
export const findSavedTierForSubject = async (
  supabase: SupabaseClient,
  params: { userId: string; qualificationLabel: string; boardLabel: string; subjectLabel: string }
): Promise<string | null> => {
  const { userId, qualificationLabel, boardLabel, subjectLabel } = params;

  const subjectId = await resolveSubjectId(supabase, { qualificationLabel, boardLabel, subjectLabel });
  if (!subjectId) return null;

  const { data } = await supabase
    .from('student_subjects')
    .select('specifications!inner(tier, subject_id)')
    .eq('user_id', userId)
    .eq('specifications.subject_id', subjectId)
    .maybeSingle();

  const spec = (data as { specifications?: { tier: string | null } } | null)?.specifications;
  return spec?.tier ?? null;
};
