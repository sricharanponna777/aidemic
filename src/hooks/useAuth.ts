'use client';

import { createClient } from '@/lib/supabase-client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { UserProfile } from '@/types';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Supabase re-fires onAuthStateChange with a freshly-allocated session
    // object whenever the tab regains focus, even when nothing actually
    // changed. Tracking the signed-in user id here lets us skip re-fetching
    // the profile (and, via setSession's updater, skip handing consumers a
    // new session reference) so pages don't reload every time the user
    // clicks away and back.
    let currentUserId: string | null = null;

    const loadProfile = async (userId: string) => {
      const { data: prof, error: profErr } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profErr && profErr.code !== 'PGRST116') {
        console.error('Error fetching user profile:', profErr.message);
        setProfile(null);
        return;
      }

      setProfile(prof);
    };

    const applySession = (nextSession: Session | null) => {
      const nextUserId = nextSession?.user?.id ?? null;
      setSession((prev) =>
        prev?.access_token === nextSession?.access_token && (prev?.user?.id ?? null) === nextUserId ? prev : nextSession
      );

      if (nextUserId !== currentUserId) {
        currentUserId = nextUserId;
        if (nextUserId) {
          void loadProfile(nextUserId);
        } else {
          setProfile(null);
        }
      }
    };

    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        applySession(data.session);
      } catch (error) {
        console.error('Auth error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        applySession(session);
        if (!session) {
          router.push('/');
        }
      }
    );

    return () => subscription?.unsubscribe();
  }, [router, supabase]);

  return { session, isLoading, profile };
}
