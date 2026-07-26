'use client';

import { createClient } from '@/lib/supabase-client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { Alert, Label, fieldStyles } from '@/components/ui/field';

function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSignUpOverride, setIsSignUpOverride] = useState<boolean | null>(null);
  const [role, setRole] = useState<'student' | 'teacher' | 'parent'>('student');
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSignUp = isSignUpOverride ?? searchParams.get('mode') === 'signup';

  const envError =
    !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? 'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local'
      : '';

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const supabase = createClient();

      if (isSignUp) {
        const onboardingPath = `/onboarding?role=${role}`;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) {
          throw new Error(error.message);
        }
        if (!data.session) {
          throw new Error(
            'Account created, but Supabase email confirmation is still enabled. Disable Confirm Email in Supabase Authentication > Sign In / Providers > Email.'
          );
        }

        const trimmedFirstName = firstName.trim();
        const trimmedLastName = lastName.trim();
        const { error: profileError } = await supabase.from('user_profiles').upsert({
          id: data.session.user.id,
          email,
          username: username.trim(),
          first_name: trimmedFirstName,
          last_name: trimmedLastName,
          full_name: `${trimmedFirstName} ${trimmedLastName}`.trim(),
          role,
        });
        if (profileError) {
          throw new Error(
            profileError.code === '23505'
              ? 'That username is already taken. Please choose another.'
              : profileError.message
          );
        }

        try {
          await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            }),
          });
        } catch (syncErr) {
          console.error('Failed to sync new signup session:', syncErr);
        }
        router.push(onboardingPath);
        return;
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

          const nextPath = searchParams.get('next') || '/dashboard';
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas p-4">
      {/* Brand wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_15%_-10%,var(--t-accent-muted),transparent_60%),radial-gradient(700px_450px_at_85%_110%,var(--t-accent-muted),transparent_55%)]"
      />

      <div className="relative w-full max-w-md rounded-card border border-subtle bg-surface p-8 shadow-raised">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-control bg-linear-to-br from-accent to-accent-2 text-white shadow-raised">
            <Zap className="h-6 w-6" />
          </span>
        <h1 className="text-display text-content">AIDemic</h1>
        <p className="mt-1 text-body text-content-subtle">
            {isSignUp ? 'Create your account to start revising' : 'Welcome back — pick up where you left off'}
          </p>
        </div>

        {envError && (
          <Alert tone="warning" className="mb-6">
            {envError}
          </Alert>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div>
              <Label>I am a…</Label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Account type">
                {(['student', 'teacher', 'parent'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={role === option}
                    onClick={() => setRole(option)}
                    disabled={isLoading || !!envError}
                    className={buttonStyles({
                      variant: role === option ? 'primary' : 'secondary',
                      size: 'sm',
                      className: 'capitalize',
                    })}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isSignUp && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="firstName">First name</Label>
                <input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  disabled={isLoading || !!envError}
                  className={fieldStyles()}
                  required
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last name</Label>
                <input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  disabled={isLoading || !!envError}
                  className={fieldStyles()}
                  required
                />
              </div>
            </div>
          )}

          {isSignUp && (
            <div>
              <Label htmlFor="username">Username</Label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="john_doe"
                disabled={isLoading || !!envError}
                pattern="[a-zA-Z0-9_]{3,20}"
                title="3-20 characters: letters, numbers, and underscores only"
                className={fieldStyles()}
                required
              />
            </div>
          )}

          <div>
            <Label htmlFor="email">Email</Label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={isLoading || !!envError}
              className={fieldStyles()}
              required
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <input
              id="password"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              disabled={isLoading || !!envError}
              className={fieldStyles()}
              required
            />
          </div>

          {error && <Alert tone="danger">{error}</Alert>}

          <button
            type="submit"
            disabled={isLoading || !!envError}
            className={buttonStyles({ variant: 'primary', className: 'w-full' })}
          >
            {isLoading ? 'Processing…' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-body text-content-subtle">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUpOverride(!isSignUp);
                setError('');
              }}
              className={buttonStyles({ variant: 'ghost', size: 'none', className: 'inline-flex px-2 py-1 align-baseline text-accent' })}
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
