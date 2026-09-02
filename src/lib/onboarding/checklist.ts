import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BarChart3,
  Brain,
  ClipboardList,
  GraduationCap,
  Layers,
  Printer,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * The "get started" checklist shown on the dashboard until it is finished.
 *
 * Every item is derived from a row the user can actually create, never from a
 * page visit: a checklist that ticks itself for opening a tab teaches nothing
 * and can never be trusted afterwards. That rules out Notes and Podcasts —
 * generated notes live in sessionStorage, so there is nothing to count.
 */
export type ChecklistItem = {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
  cta: string;
  done: boolean;
};

// A failed count reads as "not done yet", which at worst leaves a finished step
// un-ticked. Treating it as done would hide the step that matters most.
const countOf = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
  const { count, error } = await query;
  return error ? 0 : count ?? 0;
};

export async function loadStudentChecklist(
  supabase: SupabaseClient,
  userId: string,
): Promise<ChecklistItem[]> {
  const head = (table: string) => supabase.from(table).select('id', { count: 'exact', head: true });

  const [subjects, decks, sessions, attempts, paperAttempts] = await Promise.all([
    countOf(head('student_subjects').eq('user_id', userId)),
    countOf(head('flashcard_decks').eq('user_id', userId)),
    countOf(head('study_sessions').eq('user_id', userId)),
    countOf(head('exam_practice_attempts').eq('user_id', userId)),
    // `printed_papers` has RLS on with no client policies at all, so a browser
    // count of it is always 0. The marked attempt a scan produces is readable,
    // and is the step that actually closes the paper loop anyway.
    countOf(head('exam_practice_attempts').eq('user_id', userId).eq('answer_medium', 'paper')),
  ]);

  return [
    {
      id: 'subjects',
      icon: GraduationCap,
      title: 'Add your subjects',
      body: 'Pick your qualification, board and tier. Everything else is generated against them.',
      href: '/dashboard/subjects',
      cta: 'Add subjects',
      done: subjects > 0,
    },
    {
      id: 'practice',
      icon: Target,
      title: 'Sit your first Smart Practice',
      body: 'A short set of exam-board questions, marked against the mark scheme with a predicted grade.',
      href: '/dashboard/ai-questions',
      cta: 'Start practice',
      done: attempts > 0,
    },
    {
      id: 'flashcards',
      icon: Layers,
      title: 'Build a flashcard deck',
      body: 'Generate cards for a topic instead of writing them out yourself.',
      href: '/dashboard/flashcards',
      cta: 'Build a deck',
      done: decks > 0,
    },
    {
      id: 'revision',
      icon: Brain,
      title: 'Run a revision session',
      body: 'Spaced repetition decides what you see and when you see it again.',
      href: '/dashboard/study-sessions',
      cta: 'Revise now',
      done: sessions > 0,
    },
    {
      id: 'paper',
      icon: Printer,
      title: 'Print a paper and upload it',
      body: 'Write it by hand, photograph the pages, and AIDemic transcribes and marks them.',
      href: '/dashboard/ai-questions',
      cta: 'Print a paper',
      done: paperAttempts > 0,
    },
  ];
}

/** Teacher counts already sit in `useTeacherClassData`, so this takes them
 *  rather than re-querying what the dashboard has loaded. */
export function buildTeacherChecklist({
  classCount,
  studentCount,
  assignmentCount,
  markedAttemptCount,
}: {
  classCount: number;
  studentCount: number;
  assignmentCount: number;
  markedAttemptCount: number;
}): ChecklistItem[] {
  return [
    {
      id: 'class',
      icon: Users,
      title: 'Create your first class',
      body: 'Pick the specification once and every assignment you set inherits it.',
      href: '/dashboard/teacher/classes',
      cta: 'Create a class',
      done: classCount > 0,
    },
    {
      id: 'roster',
      icon: GraduationCap,
      title: 'Get your students in',
      body: 'Share the class invite code — students join themselves, so there is no roster to type up.',
      href: '/dashboard/teacher/classes',
      cta: 'Get the code',
      done: studentCount > 0,
    },
    {
      id: 'assignment',
      icon: ClipboardList,
      title: 'Set an assignment',
      body: 'Generate questions against the class spec or pull them from your question bank.',
      href: '/dashboard/teacher/assignments',
      cta: 'Set work',
      done: assignmentCount > 0,
    },
    {
      id: 'reports',
      icon: BarChart3,
      title: 'Read your first report',
      body: 'Once work is handed in, the marking is done for you — the report is the part worth your time.',
      href: '/dashboard/teacher/reports',
      cta: 'Open reports',
      done: markedAttemptCount > 0,
    },
  ];
}
