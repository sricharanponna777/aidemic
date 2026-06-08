'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      if (typeof window === 'undefined') return;

      const { searchParams } = new URL(window.location.href);
      const code = searchParams.get('code');
      const nextPath = searchParams.get('next') || '/dashboard';

      if (code) {
        try {
          const { createClient } = await import('@/lib/supabase-client');
          const supabase = createClient();
          const { data } = await supabase.auth.exchangeCodeForSession(code);
          if (data.session) {
            await fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
              }),
            }).catch((error) => {
              console.error('Failed to sync callback session:', error);
            });
          }
        } catch (error) {
          console.error('Auth callback error:', error);
        }
      }

      router.push(nextPath.startsWith('/') ? nextPath : '/dashboard');
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Redirecting...</p>
    </div>
  );
}
