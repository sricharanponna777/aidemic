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

    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        if (data.session?.user) {
          await loadProfile(data.session.user.id);
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.error('Auth error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setSession(session);
        if (session?.user) {
          void loadProfile(session.user.id);
        } else {
          setProfile(null);
        }
        if (!session) {
          router.push('/login');
        }
      }
    );

    return () => subscription?.unsubscribe();
  }, [router, supabase]);

  return { session, isLoading, profile };
}
