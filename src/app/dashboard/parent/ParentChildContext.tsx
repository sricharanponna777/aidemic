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
  linkChild: (inviteCode: string) => Promise<{ error?: string }>;
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
    async (inviteCode: string): Promise<{ error?: string }> => {
      if (!session) return { error: 'Not signed in.' };

      const { error } = await supabase.rpc('redeem_parent_invite_code', { p_invite_code: inviteCode.trim() });

      if (error) {
        return {
          error: error.message.includes('Invalid invite code')
            ? 'That invite code is not valid.'
            : error.message.includes('own account')
              ? 'You cannot link to your own account.'
              : 'Could not link that account.',
        };
      }

      const rows = await loadStudents(session.user.id);
      setStudents(rows);
      setSelectedStudentIdState((current) => current ?? rows[0]?.studentId ?? null);
      return {};
    },
    [session, supabase, loadStudents]
  );

  return (
    <ParentChildContext.Provider value={{ students, selectedStudentId, setSelectedStudentId, loading, linkChild }}>
      {children}
    </ParentChildContext.Provider>
  );
}
