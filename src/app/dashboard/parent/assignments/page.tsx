'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Clock, Circle } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { PageLoader } from '@/components/PageLoader';
import { gradeBadgeTone } from '@/lib/gradeTone';
import { useLinkedChildren } from '../ParentChildContext';

type AssignmentRow = {
  id: string;
  class_id: string;
  title: string;
  assignment_type: string;
  due_date?: string | null;
  created_at?: string | null;
};

type AttemptRow = {
  assignment_id: string;
  status: 'not_started' | 'in_progress' | 'completed';
  percentage?: number | null;
  predicted_grade?: string | null;
  completed_at?: string | null;
};

type Row = AssignmentRow & { attempt: AttemptRow | null };

const STATUS_META: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  completed: { label: 'Completed', icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-400' },
  in_progress: { label: 'In progress', icon: Clock, className: 'text-amber-600 dark:text-amber-400' },
  not_started: { label: 'Not started', icon: Circle, className: 'text-slate-400 dark:text-slate-500' },
};

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;

export default function ParentAssignmentsPage() {
  const supabase = createClient();
  const { selectedStudentId } = useLinkedChildren();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedStudentId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);

      const { data: memberships } = await supabase
        .from('class_students')
        .select('class_id')
        .eq('student_id', selectedStudentId)
        .eq('status', 'active');
      const classIds = ((memberships ?? []) as Array<{ class_id: string }>).map((m) => m.class_id);

      if (classIds.length === 0) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const [assignmentsResponse, attemptsResponse] = await Promise.all([
        supabase
          .from('assignments')
          .select('id, class_id, title, assignment_type, due_date, created_at')
          .in('class_id', classIds),
        supabase
          .from('assignment_attempts')
          .select('assignment_id, status, percentage, predicted_grade, completed_at')
          .eq('student_id', selectedStudentId),
      ]);

      if (cancelled) return;

      const attemptByAssignment = new Map<string, AttemptRow>();
      for (const attempt of (attemptsResponse.data ?? []) as AttemptRow[]) {
        attemptByAssignment.set(attempt.assignment_id, attempt);
      }

      const merged: Row[] = ((assignmentsResponse.data ?? []) as AssignmentRow[])
        .map((assignment) => ({ ...assignment, attempt: attemptByAssignment.get(assignment.id) ?? null }))
        .sort((a, b) => {
          const da = a.due_date ?? a.created_at ?? '';
          const db = b.due_date ?? b.created_at ?? '';
          return db.localeCompare(da);
        });

      setRows(merged);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedStudentId, supabase]);

  const summary = useMemo(() => {
    const completed = rows.filter((r) => r.attempt?.status === 'completed').length;
    return { total: rows.length, completed };
  }, [rows]);

  if (loading) {
    return <PageLoader text="Loading assignments..." />;
  }

  if (!selectedStudentId) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ClipboardList className="h-5 w-5 text-indigo-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Assignments</h2>
        </div>
        {rows.length > 0 ? (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {summary.completed}/{summary.total} completed
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
          No assignments yet. Teacher-set work will appear here once your child is added to a class.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <div className="divide-y divide-slate-100 dark:divide-white/6">
            {rows.map((row) => {
              const status = row.attempt?.status ?? 'not_started';
              const meta = STATUS_META[status] ?? STATUS_META.not_started;
              const StatusIcon = meta.icon;
              const due = formatDate(row.due_date);
              return (
                <div key={row.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{row.title}</p>
                    <p className="text-xs capitalize text-slate-500 dark:text-slate-400">
                      {row.assignment_type}
                      {due ? ` · Due ${due}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {status === 'completed' && row.attempt?.predicted_grade ? (
                      <span
                        className={`inline-flex min-w-10 justify-center rounded-lg px-2.5 py-1 text-xs font-black ${gradeBadgeTone({
                          grade: row.attempt.predicted_grade,
                        })}`}
                      >
                        {row.attempt.predicted_grade}
                      </span>
                    ) : null}
                    {status === 'completed' && typeof row.attempt?.percentage === 'number' ? (
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {Math.round(row.attempt.percentage)}%
                      </span>
                    ) : null}
                    <span className={`flex items-center gap-1.5 text-xs font-semibold ${meta.className}`}>
                      <StatusIcon className="h-4 w-4" />
                      {meta.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
