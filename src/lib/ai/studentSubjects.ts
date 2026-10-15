import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserSubject } from '@/lib/ai/subjectConfig';
import { qualificationByDbName } from '@/lib/ai/qualifications';

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

  // The qualification name round-trips back through getExamTypeLabel when resolving a
  // specification, so it must map to a registry slug rather than a bare lowercase name.
  const examType =
    qualificationByDbName(qualification?.name)?.id ?? (qualification?.name ?? '').toLowerCase();

  return {
    id: row.id,
    subject: (subject?.name ?? '').toLowerCase() as UserSubject['subject'],
    exam_board: (board?.name ?? '').toLowerCase() as UserSubject['exam_board'],
    exam_type: examType as UserSubject['exam_type'],
    spec_name: spec?.name ?? null,
    spec_tier: spec?.tier ?? null,
  };
};

/** Resolves the subjects.id for an exact (qualification, exam board, subject) combination by
 * walking down the seeded curriculum tree. Returns null if no match exists. */
export const resolveSubjectId = async (
  supabase: SupabaseClient,
  params: { qualificationLabel: string; boardLabel: string; subjectLabel: string }
): Promise<string | null> => {
  const { qualificationLabel, boardLabel, subjectLabel } = params;

  // Board names are only unique within a curriculum, and .maybeSingle() errors rather
  // than picking one when two curricula share a board, so scope by country whenever the
  // qualification is one we know about.
  const country = qualificationByDbName(qualificationLabel)?.country ?? null;
  let boardQuery = supabase
    .from('exam_boards')
    .select('id, qualifications!inner(name, curricula!inner(country))')
    .ilike('name', boardLabel)
    .eq('qualifications.name', qualificationLabel);
  if (country) boardQuery = boardQuery.eq('qualifications.curricula.country', country);

  const { data: examBoard } = await boardQuery.maybeSingle();
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

/** Tier and board, which decide which grade-boundary table a percentage is read
 *  against and whether the edexcel -2 / ocr -1 offset applies. */
export type GradeContext = { specTier: string | null; examBoard: string | null };

/**
 * Enrolment context indexed the way exam_practice_attempts rows are grouped:
 * by subject AND qualification.
 *
 * Keyed on subject alone, a student taking the same subject at two
 * qualifications -- mathematics at GCSE and at A-Level across a Year 11-12
 * transition -- collapsed to one entry and the last row won. Their GCSE attempts
 * were then graded against the A-Level ladder with the other enrolment's board
 * offset, which is the exact divergence between a parent's number and the
 * student's own that passing tier and board through was meant to remove.
 *
 * Read it back with gradeContextFor(), never with .get() directly: the two key
 * shapes have to be built in one place to stay in agreement.
 */
export const buildGradeContext = (rows: StudentSubjectRow[]): Map<string, GradeContext> => {
  const map = new Map<string, GradeContext>();
  for (const row of rows) {
    const mapped = mapStudentSubjectRow(row);
    if (!mapped.subject) continue;
    const context: GradeContext = {
      specTier: mapped.spec_tier ?? null,
      examBoard: mapped.exam_board ?? null,
    };
    map.set(`${mapped.subject}|${mapped.exam_type || 'unknown'}`, context);
    // Subject-only fallback, first enrolment wins: an attempt whose exam_type is
    // null or names a qualification the student is no longer enrolled in still
    // grades against something rather than losing its tier entirely.
    if (!map.has(mapped.subject)) map.set(mapped.subject, context);
  }
  return map;
};

/** Looks up what buildGradeContext stored, preferring the exact qualification. */
export const gradeContextFor = (
  context: Map<string, GradeContext>,
  subject: string,
  examType: string | null
): GradeContext | undefined =>
  context.get(`${subject}|${examType || 'unknown'}`) ?? context.get(subject);
