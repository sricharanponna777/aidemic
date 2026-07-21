import Link from 'next/link';
import { Compass } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef2fb] px-4 py-8 dark:bg-[#0A0F1E]">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25">
          <Compass className="h-6 w-6" />
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
          Error 404
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Page not found</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <Link href="/dashboard" className={buttonStyles({ variant: 'primary', size: 'lg', className: 'mt-8 w-full' })}>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
