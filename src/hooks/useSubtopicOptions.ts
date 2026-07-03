'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-client';

/** Subtopic suggestions for a DB-backed topic (topics.id). Returns no suggestions
 * for topics without a DB id (e.g. English Literature's static topic list). */
export function useSubtopicOptions(topicId: string | null): { subtopics: string[]; isLoading: boolean } {
  const [subtopics, setSubtopics] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!topicId) return;

    let cancelled = false;

    const supabase = createClient();
    const load = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from('subtopics')
        .select('name')
        .eq('topic_id', topicId)
        .order('order_index', { ascending: true });
      if (cancelled) return;
      setSubtopics(((data as { name: string }[]) ?? []).map((row) => row.name));
      setIsLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [topicId]);

  if (!topicId) return { subtopics: [], isLoading: false };

  return { subtopics, isLoading };
}
