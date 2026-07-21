'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, GraduationCap } from 'lucide-react';
import { SubjectManager } from '@/components/SubjectManager';
import { buttonStyles } from '@/components/ui/button';

export default function SubjectsPage() {
  return (
    <main className="space-y-7" aria-labelledby="subjects-title">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-linear-to-br from-indigo-50 to-white p-6 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.7)] dark:border-white/6 dark:from-[#131B2E] dark:to-[#0d1424] dark:shadow-[0_24px_48px_-28px_rgba(2,6,23,0.95)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">Step 1 of 5</p>
            <div className="mt-2 flex items-center gap-3">
              <GraduationCap className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
              <h1 id="subjects-title" className="text-3xl font-bold text-slate-900 dark:text-white">Subjects</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Manage the qualifications AIDemic uses for notes, flashcards, and exam practice.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" className={buttonStyles({ variant: 'secondary' })}>
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <Link href="/dashboard/notes" className={buttonStyles({ variant: 'primary' })}>
              <BookOpen className="h-4 w-4" />
              Learn
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <SubjectManager />
    </main>
  );
}
