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

  const [inviteCode, setInviteCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState('');

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleLink = async () => {
    if (!inviteCode.trim()) {
      setError('Enter the invite code your child shared with you.');
      return;
    }
    setIsLinking(true);
    setError('');

    const { error: linkError } = await supabase.rpc('redeem_parent_invite_code', {
      p_invite_code: inviteCode.trim(),
    });

    setIsLinking(false);
    if (linkError) {
      setError(
        linkError.message.includes('Invalid invite code')
          ? 'That invite code is not valid.'
          : linkError.message.includes('own account')
            ? 'You cannot link to your own account.'
            : 'Could not link that account. Please try again.'
      );
      return;
    }

    router.push('/dashboard/parent');
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef2fb] dark:bg-[#0A0F1E]">
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
    <main className="flex min-h-screen items-center justify-center bg-[#eef2fb] px-4 py-8 dark:bg-[#0A0F1E] sm:px-6">
      <div className="w-full max-w-3xl">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25 dark:animate-glow-pulse">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
                  Welcome to AIDemic
                </p>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Link your child&apos;s account.</h1>
              </div>
            </div>
            <button type="button" onClick={handleSignOut} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>

          <div className="mt-8 space-y-2">
            <label htmlFor="inviteCode" className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              Family invite code
            </label>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Ask your child to open Family in their AIDemic dashboard and share their invite code with you.
            </p>
            <input
              id="inviteCode"
              type="text"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
              placeholder="Enter invite code"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono uppercase tracking-widest text-slate-900 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
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
              {isLinking ? 'Linking...' : 'Link account'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/parent')}
              className={buttonStyles({ variant: 'secondary', size: 'lg' })}
            >
              Skip for now
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
