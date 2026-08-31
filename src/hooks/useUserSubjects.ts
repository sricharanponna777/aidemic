'use client';

import useSWR from 'swr';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import type { UserSubject } from '@/lib/ai/subjectConfig';
import { mapStudentSubjectRow, STUDENT_SUBJECT_SELECT, type StudentSubjectRow } from '@/lib/ai/studentSubjects';

const fetchUserSubjects = async (userId: string): Promise<UserSubject[]> => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('student_subjects')
    .select(STUDENT_SUBJECT_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load user subjects', error);
    throw error;
  }
  return ((data as unknown as StudentSubjectRow[]) ?? []).map(mapStudentSubjectRow);
};

export function useUserSubjects() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const { data, error, isLoading } = useSWR(
    userId ? ['student-subjects', userId] : null,
    () => fetchUserSubjects(userId as string)
  );

  return {
    subjects: data ?? [],
    isLoading,
    error: error ? 'Could not load your saved subjects.' : null,
  };
}
