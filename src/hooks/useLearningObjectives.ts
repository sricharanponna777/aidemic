'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase-client';
import { resolveSubjectId } from '@/lib/ai/studentSubjects';
import { getExamBoardLabel, getExamTypeLabel, getSubjectLabel, type UserSubject } from '@/lib/ai/subjectConfig';

export type GenerationMode = 'notes' | 'flashcards' | 'exam_practice';

const fetchLearningObjectives = async (subject: UserSubject, mode: GenerationMode): Promise<string[]> => {
  const supabase = createClient();
  const subjectId = await resolveSubjectId(supabase, {
    qualificationLabel: getExamTypeLabel(subject.exam_type),
    boardLabel: getExamBoardLabel(subject.exam_board),
    subjectLabel: getSubjectLabel(subject.subject),
  });
  if (!subjectId) return [];

  const { data } = await supabase.from('learning_objectives').select('objective, applies_to').eq('subject_id', subjectId);
  const rows = (data ?? []) as { objective: string; applies_to: string[] }[];
  return rows.filter((row) => row.applies_to.includes(mode)).map((row) => row.objective);
};

/** Subject-level, cross-cutting learning objectives (e.g. "learn command words",
 * "build problem-solving skills") scoped to the given content-generation mode. */
export function useLearningObjectives(
  subject: UserSubject | null,
  mode: GenerationMode
): { objectives: string[]; isLoading: boolean } {
  const { data, isLoading } = useSWR(
    subject ? ['learning-objectives', subject.id, subject.subject, subject.exam_board, subject.exam_type, mode] : null,
    () => fetchLearningObjectives(subject as UserSubject, mode)
  );

  if (!subject) return { objectives: [], isLoading: false };

  return { objectives: data ?? [], isLoading };
}
