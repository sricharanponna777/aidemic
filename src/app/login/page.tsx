'use client';

import { createClient } from '@/lib/supabase-client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buttonStyles } from '@/components/ui/button';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const router = useRouter();

  const envError =
    !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? '⚠️ Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local'
      : '';

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const supabase = createClient();

      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
          },
        });
        if (error) {
          throw new Error(error.message);
        }
        setError('✅ Check your email to confirm your account');
        setEmail('');
        setPassword('');
      } else {
        const { error: signInError, data } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          throw new Error(signInError.message);
        }
        
        if (data?.session) {
          // Sync the browser session to Supabase SSR cookies before the
          // protected dashboard route runs its server-side auth guard.
          try {
            const syncResponse = await fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
              }),
            });
            if (!syncResponse.ok) {
              const errorBody = await syncResponse.json().catch(() => ({}));
              console.error('Session sync failed:', errorBody);
            }
          } catch (syncErr) {
            console.error('Failed to sync session with server:', syncErr);
          }

          const nextPath = new URLSearchParams(window.location.search).get('next') || '/dashboard';
          router.push(nextPath.startsWith('/') ? nextPath : '/dashboard');
        } else {
          throw new Error('No session created after login');
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      console.error('Auth error:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-400 to-blue-700 dark:from-blue-600 dark:to-blue-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
        <h1 className="text-3xl font-bold text-center mb-2 text-gray-900 dark:text-gray-100">AIDemic</h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
          AI-Powered Study Companion
        </p>

        {envError && (
          <div className="mb-6 p-4 rounded-lg bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-sm border border-yellow-300 dark:border-yellow-700">
            {envError}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={isLoading || !!envError}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-gray-100 dark:disabled:bg-gray-600"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isLoading || !!envError}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-gray-100 dark:disabled:bg-gray-600"
              required
            />
          </div>

          {error && (
            <div className={`p-3 rounded-lg text-sm ${
              error.includes('✅')
                ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 border border-green-300 dark:border-green-700'
                : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 border border-red-300 dark:border-red-700'
            }`}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !!envError}
            className={buttonStyles({ variant: 'primary', className: 'w-full' })}
          >
            {isLoading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600 text-sm">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className={buttonStyles({ variant: 'ghost', size: 'none', className: 'inline-flex px-2 py-1 align-baseline' })}
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
