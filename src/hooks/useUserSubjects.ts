'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import type { UserSubject } from '@/lib/ai/subjectConfig';

const isMissingSubjectSpecColumns = (error: { code?: string; message?: string } | null) => {
  const message = error?.message?.toLowerCase() ?? '';
  return error?.code === '42703' || message.includes('spec_name') || message.includes('spec_tier');
};

export function useUserSubjects() {
  const { session } = useAuth();
  const [subjects, setSubjects] = useState<UserSubject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    let isMounted = true;
    const loadSubjects = async () => {
      setIsLoading(true);
      setError(null);

      const supabase = createClient();
      const { data, error: loadError } = await supabase
        .from('user_subjects')
        .select('id, subject, exam_board, exam_type, spec_name, spec_tier')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true });

      if (!isMounted) return;
      if (loadError) {
        if (isMissingSubjectSpecColumns(loadError)) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('user_subjects')
            .select('id, subject, exam_board, exam_type')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: true });

          if (!isMounted) return;
          if (!fallbackError) {
            setSubjects(((fallbackData as UserSubject[]) ?? []).map((subject) => ({
              ...subject,
              spec_name: null,
              spec_tier: null,
            })));
            setError('Run the latest Supabase migration, then update each saved subject with its specification and tier.');
            setIsLoading(false);
            return;
          }
        }
        console.error('Failed to load user subjects', loadError);
        setSubjects([]);
        setError('Could not load your saved subjects.');
      } else {
        setSubjects((data as UserSubject[]) ?? []);
      }
      setIsLoading(false);
    };

    void loadSubjects();
    return () => {
      isMounted = false;
    };
  }, [session?.user?.id]);

  return { subjects, isLoading, error };
}
