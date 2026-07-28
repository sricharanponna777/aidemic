'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, GraduationCap } from 'lucide-react';
import { SubjectManager } from '@/components/SubjectManager';
import { buttonStyles } from '@/components/ui/button';

export default function SubjectsPage() {
  return (
    <main className="space-y-7" aria-labelledby="subjects-title">
      <section className="overflow-hidden rounded-2xl border border-subtle bg-linear-to-br from-accent-muted to-surface p-6 shadow-raised">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <GraduationCap className="h-7 w-7 text-accent" />
              <h1 id="subjects-title" className="text-3xl font-bold text-content dark:text-white">Subjects</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-content-muted">
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
