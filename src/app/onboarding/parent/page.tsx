'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, LogOut, Users, Zap } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';

export default function ParentOnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const { session, isLoading } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState('');
  const [requestSent, setRequestSent] = useState<string | null>(null);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleLink = async () => {
    if (!identifier.trim()) {
      setError("Enter your child's email or username.");
      return;
    }
    setIsLinking(true);
    setError('');

    const { data, error: linkError } = await supabase.rpc('request_parent_link', {
      p_identifier: identifier.trim(),
    });

    setIsLinking(false);
    if (linkError) {
      setError(
        linkError.message.includes('No student found')
          ? 'No student found with that email or username.'
          : linkError.message.includes('Multiple accounts match')
            ? 'Multiple accounts match that email — ask your child for their username instead.'
            : linkError.message.includes('already linked')
              ? 'You are already linked to this student.'
              : linkError.message.includes('already pending')
                ? 'A request is already pending for this student.'
                : linkError.message.includes('own account')
                  ? 'You cannot link to your own account.'
                  : 'Could not send the request. Please try again.'
      );
      return;
    }

    const studentName = (data as Array<{ student_display_name: string }>)?.[0]?.student_display_name;
    setRequestSent(studentName || 'Your child');
    setIdentifier('');
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-500" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-purple-500 [animation-delay:0.15s]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:0.3s]" />
        </div>
      </main>
    );
  }

  if (!session) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8 sm:px-6">
      <div className="w-full max-w-3xl">
        <section className="overflow-hidden rounded-2xl border border-subtle bg-surface p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25 dark:animate-glow-pulse">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                  Welcome to AIDemic
                </p>
                <h1 className="text-3xl font-bold text-content dark:text-white">Link your child&apos;s account.</h1>
              </div>
            </div>
            <button type="button" onClick={handleSignOut} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>

          {requestSent ? (
            <div className="mt-8 space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/30 dark:bg-green-950/10">
                <p className="text-sm font-semibold text-green-900 dark:text-green-100">Request sent to {requestSent}</p>
                <p className="mt-2 text-sm text-green-800 dark:text-green-200">
                  They&apos;ll need to approve it from their dashboard before you can see their progress.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/parent')}
                  className={buttonStyles({ variant: 'primary', size: 'lg', className: 'flex-1' })}
                >
                  <LogIn className="h-4 w-4" />
                  Go to dashboard
                </button>
                <button
                  type="button"
                  onClick={() => setRequestSent(null)}
                  className={buttonStyles({ variant: 'secondary', size: 'lg' })}
                >
                  Add another child
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-8 space-y-2">
                <label htmlFor="identifier" className="flex items-center gap-2 text-sm font-semibold text-content">
                  <Users className="h-4 w-4 text-accent" />
                  Child&apos;s email or username
                </label>
                <p className="text-sm text-content-muted">
                  Enter your child&apos;s email address or username to send them a parent link request.
                </p>
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="Email or username"
                  className="w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-sm text-content outline-none focus:border-accent"
                />
              </div>

              {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

              <div className="mt-8 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleLink}
                  disabled={isLinking}
                  className={buttonStyles({ variant: 'primary', size: 'lg', className: 'flex-1' })}
                >
                  <LogIn className="h-4 w-4" />
                  {isLinking ? 'Sending...' : 'Send request'}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/parent')}
                  className={buttonStyles({ variant: 'secondary', size: 'lg' })}
                >
                  Skip for now
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
