'use client';

import { useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { XP_AWARDED_EVENT, fetchBadges, fetchGamification, fetchLeague } from '@/lib/gamification/client';

/**
 * SWR-cached reads of the gamification RPCs, shared by the sidebar rank panel,
 * the Progress page and Blurting. Students only: teachers and parents earn no
 * XP, so the hooks fetch nothing for them.
 *
 * Every key starts with 'gamification', and an XP award anywhere in the app
 * revalidates all of them (see useRefreshOnXp in the shell).
 */

const useStudentId = () => {
  const { session, profile } = useAuth();
  return profile?.role === 'student' ? session?.user?.id ?? null : null;
};

export function useGamification() {
  const userId = useStudentId();
  return useSWR(userId ? ['gamification', 'summary', userId] : null, () => fetchGamification(createClient()));
}

export function useLeague() {
  const userId = useStudentId();
  return useSWR(userId ? ['gamification', 'league', userId] : null, () => fetchLeague(createClient()));
}

export function useBadges() {
  const userId = useStudentId();
  return useSWR(userId ? ['gamification', 'badges', userId] : null, () => fetchBadges(createClient()));
}

/** Revalidate every gamification read whenever an award is announced. */
export function useRefreshOnXp() {
  useEffect(() => {
    const refresh = () => {
      void mutate((key) => Array.isArray(key) && key[0] === 'gamification');
    };
    window.addEventListener(XP_AWARDED_EVENT, refresh);
    return () => window.removeEventListener(XP_AWARDED_EVENT, refresh);
  }, []);
}
