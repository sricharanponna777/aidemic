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
  /** Re-read the link list. The acceptance happens in the child's browser. */
  refresh: () => Promise<void>;
};

const STORAGE_KEY = 'aidemic-parent-child';

/** How often to look for an accepted link while the parent has none yet. */
const PENDING_POLL_MS = 30_000;

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

  /**
   * Apply the current link list.
   *
   * Deliberately does not touch `loading`: it runs on a timer and on every tab
   * focus, and a parent reading the page should not get the full-page loader
   * thrown over it every thirty seconds. Only the first load clears it.
   */
  const applyStudents = useCallback(
    async (parentId: string) => {
      const rows = await loadStudents(parentId);
      setStudents(rows);
      setSelectedStudentIdState((current) => {
        // Keep the parent on the child they were already looking at.
        if (current && rows.some((row) => row.studentId === current)) return current;
        let stored: string | null = null;
        try {
          stored = window.localStorage.getItem(STORAGE_KEY);
        } catch {
          stored = null;
        }
        const validStored = stored && rows.some((row) => row.studentId === stored) ? stored : null;
        return validStored ?? rows[0]?.studentId ?? null;
      });
    },
    [loadStudents]
  );

  const refresh = useCallback(async () => {
    if (!session) return;
    await applyStudents(session.user.id);
  }, [session, applyStudents]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const load = async () => {
      await applyStudents(session.user.id);
      if (!cancelled) setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session, applyStudents]);

  /**
   * A child accepts the request in their own browser, and there is no channel
   * back to this one -- no Realtime anywhere in the app, and useAuth
   * deliberately dampens the session churn that would otherwise re-run the
   * effect above. So re-read on the two moments a parent would otherwise reach
   * for F5: coming back to the tab, and sitting on an empty dashboard waiting.
   */
  useEffect(() => {
    if (!session) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    const poll =
      students.length === 0
        ? window.setInterval(() => {
            if (document.visibilityState === 'visible') void refresh();
          }, PENDING_POLL_MS)
        : undefined;

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      if (poll !== undefined) window.clearInterval(poll);
    };
  }, [session, refresh, students.length]);

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
    <ParentChildContext.Provider
      value={{ students, selectedStudentId, setSelectedStudentId, loading, linkChild, refresh }}
    >
      {children}
    </ParentChildContext.Provider>
  );
}
