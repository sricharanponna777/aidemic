'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase-client';

const fetchSubtopics = async (topicId: string): Promise<string[]> => {
  const supabase = createClient();
  const { data } = await supabase
    .from('subtopics')
    .select('name')
    .eq('topic_id', topicId)
    .order('order_index', { ascending: true });
  return ((data as { name: string }[]) ?? []).map((row) => row.name);
};

/** Subtopic suggestions for a DB-backed topic (topics.id). Returns no suggestions
 * for topics without a DB id (e.g. English Literature's static topic list). */
export function useSubtopicOptions(topicId: string | null): { subtopics: string[]; isLoading: boolean } {
  const { data, isLoading } = useSWR(topicId ? ['subtopic-options', topicId] : null, () => fetchSubtopics(topicId as string));

  if (!topicId) return { subtopics: [], isLoading: false };

  return { subtopics: data ?? [], isLoading };
}
