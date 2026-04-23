'use client';

import { createClient } from '@/lib/supabase-client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { UserProfile } from '@/types';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
          // if we have a session, try loading the user profile row
          if (data.session?.user) {
            const { data: prof, error: profErr } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', data.session.user.id)
              .single();
            if (profErr && profErr.code !== 'PGRST116') {
              console.error('Error fetching user profile:', profErr.message);
            } else {
              setProfile(prof);
            }
          }
      } catch (error) {
        console.error('Auth error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (!session) {
          router.push('/login');
        }
      }
    );

    return () => subscription?.unsubscribe();
  }, [router, supabase]);

    return { session, isLoading, profile };
}
