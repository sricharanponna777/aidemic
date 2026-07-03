'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import type { UserSubject } from '@/lib/ai/subjectConfig';
import { mapStudentSubjectRow, STUDENT_SUBJECT_SELECT, type StudentSubjectRow } from '@/lib/ai/studentSubjects';

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
        .from('student_subjects')
        .select(STUDENT_SUBJECT_SELECT)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true });

      if (!isMounted) return;
      if (loadError) {
        console.error('Failed to load user subjects', loadError);
        setSubjects([]);
        setError('Could not load your saved subjects.');
      } else {
        setSubjects(((data as unknown as StudentSubjectRow[]) ?? []).map(mapStudentSubjectRow));
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
