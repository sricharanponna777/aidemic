'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GraduationCap, Globe2, LogOut, Zap } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { COUNTRIES, COUNTRY_LABELS, type Country } from '@/lib/ai/countryConfig';
import { useState } from 'react';

const isCountry = (value: string | null): value is Country =>
  !!value && COUNTRIES.includes(value as Country);

type Role = 'student' | 'teacher' | 'parent';

const isRole = (value: string | null): value is Role =>
  value === 'student' || value === 'teacher' || value === 'parent';

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { session, profile, isLoading } = useAuth();
  const [countryOverride, setCountryOverride] = useState<Country | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const countryFromUrl = searchParams.get('country');
  const savedCountry = isCountry(profile?.country ?? null) ? profile?.country : null;
  const country = countryOverride ?? savedCountry ?? (isCountry(countryFromUrl) ? countryFromUrl : 'uk');

  const roleFromUrl = searchParams.get('role');
  const savedRole = isRole(profile?.role ?? null) ? profile?.role : null;
  const role: Role = savedRole ?? (isRole(roleFromUrl) ? roleFromUrl : 'student');

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleSaveCountry = async () => {
    if (!session?.user?.id) return;
    setIsSaving(true);
    setError('');

    const { error: saveError } = await supabase
      .from('user_profiles')
      .upsert({
        id: session.user.id,
        email: session.user.email ?? '',
        country,
        role,
      });

    setIsSaving(false);
    if (saveError) {
      console.error('Failed to save onboarding country:', saveError.message);
      setError('Could not save your country. Please try again.');
      return;
    }

    router.push(role === 'teacher' ? '/onboarding/teacher' : role === 'parent' ? '/onboarding/parent' : '/dashboard');
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
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">You&apos;re all set.</h1>
              </div>
            </div>
            <button type="button" onClick={handleSignOut} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>

          <div className="mt-8 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 dark:border-white/6 dark:bg-white/3 dark:text-slate-300">
            <GraduationCap className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            Signing up as: <span className="font-semibold capitalize text-slate-900 dark:text-slate-100">{role}</span>
          </div>

          <div className="mt-4 space-y-2">
            <label htmlFor="country" className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <Globe2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              Where are you studying?
            </label>
            <select
              id="country"
              value={country}
              onChange={(event) => setCountryOverride(event.target.value as Country)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
            >
              {COUNTRIES.map((countryOption) => (
                <option key={countryOption} value={countryOption}>
                  {COUNTRY_LABELS[countryOption]}
                </option>
              ))}
            </select>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <button
            type="button"
            onClick={handleSaveCountry}
            disabled={isSaving}
            className={buttonStyles({ variant: 'primary', size: 'lg', className: 'mt-8 w-full' })}
          >
            {isSaving ? 'Saving...' : 'Continue'}
          </button>
        </section>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  );
}
