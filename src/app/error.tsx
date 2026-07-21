'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Route error boundary caught:', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef2fb] px-4 py-8 dark:bg-[#0A0F1E]">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-slate-900 dark:text-white">Something went wrong</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          An unexpected error occurred. You can try again, and if it keeps happening, head back to your dashboard.
        </p>
        <div className="mt-8 flex flex-col gap-2">
          <button type="button" onClick={reset} className={buttonStyles({ variant: 'primary', size: 'lg', className: 'w-full' })}>
            Try again
          </button>
          <a href="/dashboard" className={buttonStyles({ variant: 'secondary', size: 'lg', className: 'w-full' })}>
            Back to dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
