'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';

export type LinkedChild = { studentId: string; name: string };

type ParentChildContextValue = {
  students: LinkedChild[];
  selectedStudentId: string | null;
  setSelectedStudentId: (id: string) => void;
  loading: boolean;
  linkChild: (identifier: string) => Promise<{ error?: string; studentName?: string }>;
};

const STORAGE_KEY = 'aidemic-parent-child';

const ParentChildContext = createContext<ParentChildContextValue | null>(null);

export function useLinkedChildren() {
  const ctx = useContext(ParentChildContext);
  if (!ctx) throw new Error('useLinkedChildren must be used within a ParentChildProvider');
  return ctx;
}

export function ParentChildProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const supabase = createClient();

  const [students, setStudents] = useState<LinkedChild[]>([]);
  const [selectedStudentId, setSelectedStudentIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setSelectedStudentId = useCallback((id: string) => {
    setSelectedStudentIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // localStorage unavailable (private mode); selection just won't persist.
    }
  }, []);

  const loadStudents = useCallback(
    async (parentId: string): Promise<LinkedChild[]> => {
      const { data: linkRows, error } = await supabase
        .from('parent_links')
        .select('student_id')
        .eq('parent_id', parentId)
        .eq('status', 'active');

      if (error || !linkRows || linkRows.length === 0) return [];

      const studentIds: string[] = linkRows.map((row: { student_id: string }) => row.student_id);
      const { data: profileRows } = await supabase
        .from('user_profiles')
        .select('id, full_name, first_name, username, email')
        .in('id', studentIds);

      return studentIds.map((id: string) => {
        const p = (profileRows ?? []).find((row: { id: string }) => row.id === id) as
          | { full_name?: string; first_name?: string; username?: string; email?: string }
          | undefined;
        return { studentId: id, name: p?.full_name || p?.first_name || p?.username || p?.email || 'Student' };
      });
    },
    [supabase]
  );

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const rows = await loadStudents(session.user.id);
      if (cancelled) return;
      setStudents(rows);

      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        stored = null;
      }
      const validStored = stored && rows.some((r) => r.studentId === stored) ? stored : null;
      setSelectedStudentIdState(validStored ?? rows[0]?.studentId ?? null);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session, loadStudents]);

  const linkChild = useCallback(
    async (identifier: string): Promise<{ error?: string; studentName?: string }> => {
      if (!session) return { error: 'Not signed in.' };

      const { data, error } = await supabase.rpc('request_parent_link', { p_identifier: identifier.trim() });

      if (error) {
        return {
          error: error.message.includes('No student found')
            ? 'No student found with that email or username.'
            : error.message.includes('Multiple accounts match')
              ? 'Multiple accounts match that email — ask your child for their username instead.'
              : error.message.includes('already linked')
                ? 'You are already linked to this student.'
                : error.message.includes('already pending')
                  ? 'A request is already pending for this student.'
                  : error.message.includes('own account')
                    ? 'You cannot link to your own account.'
                    : 'Could not send the request. Please try again.',
        };
      }

      // Don't refresh students here — the request is pending, not linked yet.
      // Return the student's display name so the UI can show a confirmation message.
      const studentName = (data as Array<{ student_display_name: string }>)?.[0]?.student_display_name;
      return { studentName };
    },
    [session, supabase]
  );

  return (
    <ParentChildContext.Provider value={{ students, selectedStudentId, setSelectedStudentId, loading, linkChild }}>
      {children}
    </ParentChildContext.Provider>
  );
}
