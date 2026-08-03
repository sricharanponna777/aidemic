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
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSignUpOverride, setIsSignUpOverride] = useState<boolean | null>(null);
  const [authModeOverride, setAuthModeOverride] = useState<'forgot' | 'reset' | null>(null);
  const [role, setRole] = useState<'student' | 'teacher' | 'parent'>('student');
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get('mode');
  const authMode = authModeOverride ?? (requestedMode === 'forgot' || requestedMode === 'reset' ? requestedMode : null);
  const isForgotPassword = authMode === 'forgot';
  const isResetPassword = authMode === 'reset';
  const isSignUp = !authMode && (isSignUpOverride ?? requestedMode === 'signup');

  const envError =
    !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? 'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local'
      : '';

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const supabase = createClient();

      if (isForgotPassword) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/login?mode=reset')}`,
        });
        if (resetError) {
          throw new Error(resetError.message);
        }
        setMessage('Check your email for a secure link to reset your password.');
        return;
      } else if (isResetPassword) {
        if (password.length < 8) {
          throw new Error('Your new password must be at least 8 characters long.');
        }
        if (password !== passwordConfirmation) {
          throw new Error('The passwords do not match.');
        }
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) {
          throw new Error(updateError.message);
        }
        await supabase.auth.signOut();
        setPassword('');
        setPasswordConfirmation('');
        setAuthModeOverride(null);
        setIsSignUpOverride(false);
        router.replace('/login');
        setMessage('Password updated. You can now sign in with your new password.');
        return;
      } else if (isSignUp) {
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

        // Fire-and-forget, strictly after the awaited /api/auth cookie sync
        // above -- the route authenticates via supabase.auth.getUser() off the
        // SSR cookies, so firing it earlier would just 401. `keepalive` lets it
        // outlive the navigation below; a dropped request costs one welcome
        // email and never a duplicate, because the route claims a one-shot flag.
        void fetch('/api/email/welcome', { method: 'POST', keepalive: true }).catch(() => {});

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
            {isForgotPassword
              ? 'Enter your email and we’ll send you a reset link'
              : isResetPassword
                ? 'Choose a new password for your account'
                : isSignUp
                  ? 'Create your account to start revising'
                  : 'Welcome back — pick up where you left off'}
          </p>
        </div>

        {envError && (
          <Alert tone="warning" className="mb-6">
            {envError}
          </Alert>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && !authMode && (
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

          {isSignUp && !authMode && (
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

          {isSignUp && !authMode && (
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

          {!isResetPassword && (
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
          )}

          {!isForgotPassword && (
            <div>
              <Label htmlFor="password">Password</Label>
              <input
                id="password"
                type="password"
                autoComplete={isSignUp || isResetPassword ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                disabled={isLoading || !!envError}
                className={fieldStyles()}
                required
              />
            </div>
          )}

          {isResetPassword && (
            <div>
              <Label htmlFor="passwordConfirmation">Confirm new password</Label>
              <input
                id="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                placeholder="********"
                disabled={isLoading || !!envError}
                className={fieldStyles()}
                required
              />
            </div>
          )}

          {error && <Alert tone="danger">{error}</Alert>}
          {message && <Alert tone="success">{message}</Alert>}

          <button
            type="submit"
            disabled={isLoading || !!envError}
            className={buttonStyles({ variant: 'primary', className: 'w-full' })}
          >
            {isLoading
              ? 'Processing…'
              : isForgotPassword
                ? 'Send reset link'
                : isResetPassword
                  ? 'Update password'
                  : isSignUp
                    ? 'Sign Up'
                    : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          {!authMode && !isSignUp && (
            <button
              type="button"
              onClick={() => {
                setAuthModeOverride('forgot');
                setError('');
                setMessage('');
              }}
              className={buttonStyles({ variant: 'ghost', size: 'none', className: 'mb-3 px-2 py-1 text-accent' })}
            >
              Forgot your password?
            </button>
          )}
          {authMode ? (
            <p className="text-body text-content-subtle">
              Remembered your password?{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthModeOverride(null);
                  setIsSignUpOverride(false);
                  setError('');
                  setMessage('');
                  router.replace('/login');
                }}
                className={buttonStyles({ variant: 'ghost', size: 'none', className: 'inline-flex px-2 py-1 align-baseline text-accent' })}
              >
                Sign In
              </button>
            </p>
          ) : (
            <p className="text-body text-content-subtle">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => {
                  setIsSignUpOverride(!isSignUp);
                  setError('');
                  setMessage('');
                }}
                className={buttonStyles({ variant: 'ghost', size: 'none', className: 'inline-flex px-2 py-1 align-baseline text-accent' })}
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          )}
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
