'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BookOpen, GraduationCap } from 'lucide-react';
import { SubjectManager } from '@/components/SubjectManager';
import { buttonStyles } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/feedback';
import { Chip, Workspace } from '@/components/ui/telemetry';
import { useAuth } from '@/hooks/useAuth';

export default function SubjectsPage() {
  const router = useRouter();
  const { profile, isProfileLoading } = useAuth();

  // SubjectManager writes student_subjects for the signed-in user, so this page
  // must not render for a teacher or parent account.
  useEffect(() => {
    if (isProfileLoading) return;
    if (profile?.role === 'teacher') router.replace('/dashboard/teacher');
    else if (profile?.role === 'parent') router.replace('/dashboard/parent');
  }, [isProfileLoading, profile, router]);

  if (isProfileLoading || profile?.role === 'teacher' || profile?.role === 'parent') return null;

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={GraduationCap}
        eyebrow="Workspace / Subjects"
        titleId="subjects-title"
        title="Subjects"
        description="Manage the qualifications AIDemic uses for notes, flashcards, and exam practice."
        actions={
          <>
            <Chip>● Your qualifications</Chip>
            <Link href="/dashboard/notes" className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
              <BookOpen className="h-4 w-4" />
              Learn
              <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        }
      />

      <SubjectManager />
    </Workspace>
  );
}
