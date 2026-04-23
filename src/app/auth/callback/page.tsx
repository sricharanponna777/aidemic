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

      if (code) {
        try {
          const { createClient } = await import('@/lib/supabase-client');
          const supabase = createClient();
          await supabase.auth.exchangeCodeForSession(code);
        } catch (error) {
          console.error('Auth callback error:', error);
        }
      }

      router.push('/dashboard');
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Redirecting...</p>
    </div>
  );
}
