'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Sparkles, Zap } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { homeHrefForRole, TOURS, type OnboardingRole } from '@/lib/onboarding/tour';

const isRole = (value: string | null | undefined): value is OnboardingRole =>
  value === 'student' || value === 'teacher' || value === 'parent';

function WelcomeTour() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { session, profile, isLoading, isProfileLoading } = useAuth();

  const [index, setIndex] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);

  // The saved role wins: `?role=` only covers the sign-up hand-off, and a
  // teacher replaying the tour from Settings arrives without any param.
  const roleParam = searchParams.get('role');
  const savedRole = profile?.role;
  const role: OnboardingRole | null = isRole(savedRole)
    ? savedRole
    : isRole(roleParam)
      ? roleParam
      : null;

  const slides = role ? TOURS[role] : [];
  const slide = slides[index];
  const isLast = index === slides.length - 1;

  const finish = async () => {
    if (!role) return;
    setIsFinishing(true);
    if (session?.user?.id) {
      // Stamped even on skip: a tour that reappears every login is a nag, and
      // Settings already offers a deliberate way back in.
      const { error } = await supabase
        .from('user_profiles')
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq('id', session.user.id);
      if (error) console.error('Failed to record onboarding completion:', error.message);
    }
    router.push(homeHrefForRole(role));
  };

  // No role means the profile step never ran, so there is no tour to pick.
  const needsProfileStep = !isLoading && !isProfileLoading && !!session && !role;
  useEffect(() => {
    if (needsProfileStep) router.replace('/onboarding');
  }, [needsProfileStep, router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' && index < slides.length - 1) setIndex((i) => i + 1);
      if (event.key === 'ArrowLeft' && index > 0) setIndex((i) => i - 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, slides.length]);

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

  if (!session || !role || !slide) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8 sm:px-6">
      <div className="w-full max-w-3xl">
        <section className="overflow-hidden rounded-card border border-subtle bg-surface shadow-raised">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-subtle bg-linear-to-br from-accent-muted to-surface px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-control bg-linear-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25 dark:animate-glow-pulse">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-caption font-semibold uppercase tracking-[0.18em] text-accent">
                  Welcome to AIDemic
                </p>
                <p className="text-body font-medium text-content-muted">
                  A quick look at what you can do here.
                </p>
              </div>
            </div>

            <ol className="flex items-center gap-1.5" aria-label="Tour progress">
              {slides.map((item, position) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setIndex(position)}
                    aria-label={`Go to “${item.title}” (${position + 1} of ${slides.length})`}
                    aria-current={position === index ? 'step' : undefined}
                    className={`h-2 rounded-full transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      position === index
                        ? 'w-6 bg-accent'
                        : position < index
                          ? 'w-2 bg-accent/50 hover:bg-accent/70'
                          : 'w-2 bg-strong hover:bg-accent/40'
                    }`}
                  />
                </li>
              ))}
            </ol>
          </header>

          <div key={slide.id} className="animate-page-enter px-6 py-7 sm:px-8">
            <p className="text-caption font-semibold uppercase tracking-[0.18em] text-content-subtle">
              {slide.eyebrow} of {slides.length}
            </p>
            <h1 className="mt-1.5 text-display text-content dark:text-white">{slide.title}</h1>
            <p className="mt-2 max-w-2xl text-body text-content-muted">{slide.lede}</p>

            <ul className="mt-6 space-y-3">
              {slide.features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <li
                    key={feature.title}
                    className="flex gap-3.5 rounded-control border border-subtle bg-surface-sunken p-4"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-accent-muted text-accent">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-content">{feature.title}</p>
                      <p className="mt-0.5 text-body text-content-subtle">{feature.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle px-6 py-4 sm:px-8">
            <button
              type="button"
              onClick={finish}
              disabled={isFinishing}
              className={buttonStyles({ variant: 'ghost', size: 'sm' })}
            >
              Skip the tour
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                className={buttonStyles({ variant: 'secondary' })}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              {isLast ? (
                <button type="button" onClick={finish} disabled={isFinishing} className={buttonStyles({ variant: 'primary' })}>
                  <Sparkles className="h-4 w-4" />
                  {isFinishing ? 'Getting things ready…' : 'Get started'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
                  className={buttonStyles({ variant: 'primary' })}
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </footer>
        </section>

        <p className="mt-4 text-center text-caption text-content-subtle">
          You can replay this any time from Settings.
        </p>
      </div>
    </main>
  );
}

export default function WelcomePage() {
  return (
    <Suspense>
      <WelcomeTour />
    </Suspense>
  );
}
