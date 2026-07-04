'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { resolveSubjectId } from '@/lib/ai/studentSubjects';
import { getExamBoardLabel, getExamTypeLabel, getSubjectLabel, type UserSubject } from '@/lib/ai/subjectConfig';

export type GenerationMode = 'notes' | 'flashcards' | 'exam_practice';

/** Subject-level, cross-cutting learning objectives (e.g. "learn command words",
 * "build problem-solving skills") scoped to the given content-generation mode. */
export function useLearningObjectives(
  subject: UserSubject | null,
  mode: GenerationMode
): { objectives: string[]; isLoading: boolean } {
  const [objectives, setObjectives] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!subject) return;

    let cancelled = false;

    const supabase = createClient();
    const load = async () => {
      setIsLoading(true);
      const subjectId = await resolveSubjectId(supabase, {
        qualificationLabel: getExamTypeLabel(subject.exam_type),
        boardLabel: getExamBoardLabel(subject.exam_board),
        subjectLabel: getSubjectLabel(subject.subject),
      });
      if (cancelled) return;
      if (!subjectId) {
        setObjectives([]);
        setIsLoading(false);
        return;
      }

      const { data } = await supabase
        .from('learning_objectives')
        .select('objective, applies_to')
        .eq('subject_id', subjectId);
      if (cancelled) return;
      const rows = (data ?? []) as { objective: string; applies_to: string[] }[];
      setObjectives(rows.filter((row) => row.applies_to.includes(mode)).map((row) => row.objective));
      setIsLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject?.id, subject?.subject, subject?.exam_board, subject?.exam_type, mode]);

  if (!subject) return { objectives: [], isLoading: false };

  return { objectives, isLoading };
}
