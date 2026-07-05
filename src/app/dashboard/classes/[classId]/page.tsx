'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Circle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';

type ClassInfo = { id: string; name: string };
type AssignmentRow = {
  id: string;
  title: string;
  description: string | null;
  assignment_type: string;
  due_date: string | null;
};
type AttemptRow = { assignment_id: string; status: string; percentage: number | null; predicted_grade: string | null };

export default function StudentClassPage() {
  const { classId } = useParams<{ classId: string }>();
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const supabase = createClient();

  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [attempts, setAttempts] = useState<Record<string, AttemptRow>>({});
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (isLoading || !session) return;

    let cancelled = false;
    const load = async () => {
      setPageLoading(true);

      const { data: membership } = await supabase
        .from('class_students')
        .select('class_id')
        .eq('class_id', classId)
        .eq('student_id', session.user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (cancelled) return;
      if (!membership) {
        router.replace('/dashboard/classes');
        return;
      }

      const { data: classRow } = await supabase.from('classes').select('id, name').eq('id', classId).maybeSingle();
      if (cancelled) return;
      setClassInfo(classRow as ClassInfo | null);

      const { data: assignmentRows } = await supabase
        .from('assignments')
        .select('id, title, description, assignment_type, due_date')
        .eq('class_id', classId)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      setAssignments((assignmentRows as AssignmentRow[]) ?? []);

      const { data: attemptRows } = await supabase
        .from('assignment_attempts')
        .select('assignment_id, status, percentage, predicted_grade')
        .eq('student_id', session.user.id);
      if (cancelled) return;
      const map: Record<string, AttemptRow> = {};
      for (const row of (attemptRows as AttemptRow[]) ?? []) map[row.assignment_id] = row;
      setAttempts(map);

      setPageLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, router, supabase, classId]);

  if (isLoading || pageLoading || !classInfo) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading class...</p>;
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/classes" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100">
        <ArrowLeft className="h-3.5 w-3.5" />
        My Classes
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{classInfo.name}</h1>

      {assignments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
          No assignments yet.
        </p>
      ) : (
        <div className="space-y-2">
          {assignments.map((assignment) => {
            const attempt = attempts[assignment.id];
            const completed = attempt?.status === 'completed';
            return (
              <Link
                key={assignment.id}
                href={`/dashboard/classes/${classId}/assignments/${assignment.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-indigo-300 dark:border-white/6 dark:bg-[#131B2E] dark:hover:border-indigo-500/40"
              >
                <div className="flex items-center gap-3">
                  {completed ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-slate-300 dark:text-slate-600" />}
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{assignment.title}</p>
                    <p className="text-xs capitalize text-slate-500 dark:text-slate-400">
                      {assignment.assignment_type}
                      {assignment.due_date ? ` · due ${new Date(assignment.due_date).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                </div>
                {completed ? (
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {Math.round(attempt.percentage ?? 0)}% · {attempt.predicted_grade}
                  </span>
                ) : (
                  <span className="text-sm text-indigo-600 dark:text-indigo-400">Start</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
