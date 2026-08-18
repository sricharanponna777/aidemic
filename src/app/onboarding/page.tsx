'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Globe2, LogOut, UserRound, Zap } from 'lucide-react';
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
  const { session, profile, isLoading, isProfileLoading } = useAuth();
  const [countryOverride, setCountryOverride] = useState<Country | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const countryFromUrl = searchParams.get('country');
  const savedCountry = isCountry(profile?.country ?? null) ? profile?.country : null;
  const country = countryOverride ?? savedCountry ?? (isCountry(countryFromUrl) ? countryFromUrl : 'uk');

  const roleFromUrl = searchParams.get('role');
  const savedRole = isRole(profile?.role ?? null) ? profile?.role : null;
  // No 'student' fallback: defaulting here overwrote an existing parent's or
  // teacher's role whenever this page was opened without a ?role= param.
  const role: Role | null = savedRole ?? (isRole(roleFromUrl) ? roleFromUrl : null);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleContinue = async () => {
    if (!session?.user?.id || !role) return;
    setIsSaving(true);
    setError('');

    // `country` drives subject/specification lookups. Teachers need it too — it gates
    // which qualifications the class-creation form offers.
    const { error: saveError } = await supabase
      .from('user_profiles')
      .upsert({
        id: session.user.id,
        email: session.user.email ?? '',
        role,
        country,
      });

    setIsSaving(false);
    if (saveError) {
      console.error('Failed to save onboarding profile:', saveError.message);
      setError('Could not save your details. Please try again.');
      return;
    }

    router.push(role === 'teacher' ? '/onboarding/teacher' : role === 'parent' ? '/onboarding/parent' : '/dashboard');
  };

  if (isLoading || (session && isProfileLoading)) {
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

  const HEADINGS: Record<Role, { title: string; next: string }> = {
    student: { title: 'Let’s set up your studies.', next: 'Tell us where you study so we can load the right exam boards and specifications.' },
    teacher: { title: 'Let’s set up your account.', next: 'Next, we’ll ask for your school so we can verify you.' },
    parent: { title: 'Let’s set up your account.', next: 'Next, you can link your child’s account to follow their progress.' },
  };
  const heading = role ? HEADINGS[role] : null;

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
                <h1 className="text-3xl font-bold text-content dark:text-white">
                  {heading?.title ?? 'Let’s set up your account.'}
                </h1>
              </div>
            </div>
            <button type="button" onClick={handleSignOut} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>

          {role ? (
            <>
              <div className="mt-8 flex items-center gap-2 rounded-lg border border-subtle bg-surface-sunken px-3 py-2.5 text-sm text-content-muted dark:bg-surface/3">
                <UserRound className="h-4 w-4 text-accent" />
                Signing up as: <span className="font-semibold capitalize text-content">{role}</span>
              </div>

              {/* Only students have a country: it selects their exam boards and
                  specifications. Asking a parent or teacher where they study is
                  both wrong and dead data. */}
              {role === 'student' ? (
                <div className="mt-4 space-y-2">
                  <label htmlFor="country" className="flex items-center gap-2 text-sm font-semibold text-content">
                    <Globe2 className="h-4 w-4 text-accent" />
                    Where are you studying?
                  </label>
                  <select
                    id="country"
                    value={country}
                    onChange={(event) => setCountryOverride(event.target.value as Country)}
                    className="w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-sm text-content outline-none focus:border-accent"
                  >
                    {COUNTRIES.map((countryOption) => (
                      <option key={countryOption} value={countryOption}>
                        {COUNTRY_LABELS[countryOption]}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <p className="mt-4 text-sm text-content-muted">{heading?.next}</p>
            </>
          ) : (
            <p className="mt-8 text-sm text-content-muted">
              We couldn&apos;t tell whether you&apos;re signing up as a student, teacher or parent. Head back to sign-up
              and pick one so we set your account up correctly.
            </p>
          )}

          {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <button
            type="button"
            onClick={handleContinue}
            disabled={isSaving || !role}
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
