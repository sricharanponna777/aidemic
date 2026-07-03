'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { resolveSpecificationId } from '@/lib/ai/studentSubjects';
import { getMajorTopicsForSubject, isEnglishLiteratureSubject } from '@/lib/ai/majorTopics';
import { getExamBoardLabel, getExamTypeLabel, getSavedSpecName, getSubjectLabel, type UserSubject } from '@/lib/ai/subjectConfig';

export type TopicOption = { id: string | null; name: string };

/** Topic suggestions for the content-generation forms.
 * English Literature keeps the existing majorTopics.ts logic (poetry-cluster/set-text
 * branching depends on runtime state that isn't modelled in the topics table).
 * Every other subject reads from the seeded topics table for the resolved specification. */
export function useTopicOptions(
  subject: UserSubject | null,
  specOption: string,
  poemOne: string,
  poemTwo: string
): { topics: TopicOption[]; isLoading: boolean } {
  const [dbTopics, setDbTopics] = useState<TopicOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const specName = getSavedSpecName(subject);
  const isEnglishLit = isEnglishLiteratureSubject(subject, specName);

  useEffect(() => {
    if (!subject || isEnglishLit) return;

    let cancelled = false;

    const supabase = createClient();
    const load = async () => {
      setIsLoading(true);
      const specificationId = await resolveSpecificationId(supabase, {
        qualificationLabel: getExamTypeLabel(subject.exam_type),
        boardLabel: getExamBoardLabel(subject.exam_board),
        subjectLabel: getSubjectLabel(subject.subject),
        specName,
        specTier: subject.spec_tier,
      });
      if (cancelled) return;
      if (!specificationId) {
        setDbTopics([]);
        setIsLoading(false);
        return;
      }

      const { data } = await supabase
        .from('topics')
        .select('id, name')
        .eq('specification_id', specificationId)
        .order('order_index', { ascending: true });
      if (cancelled) return;
      setDbTopics((data as TopicOption[]) ?? []);
      setIsLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject?.id, subject?.subject, subject?.exam_board, subject?.exam_type, subject?.spec_tier, specName, isEnglishLit]);

  if (isEnglishLit) {
    const names = getMajorTopicsForSubject(subject, specOption, poemOne, poemTwo);
    return { topics: names.map((name) => ({ id: null, name })), isLoading: false };
  }

  if (!subject) return { topics: [], isLoading: false };

  return { topics: dbTopics, isLoading };
}
