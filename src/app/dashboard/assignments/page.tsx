'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, ClipboardList, Radar } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { PageLoader } from '@/components/PageLoader';
import { PageHeader } from '@/components/ui/feedback';
import { Chip, Meter, PanelHeading, Stat, StatusBar, Workspace, WorkspaceBody } from '@/components/ui/telemetry';

type AssignmentRow = {
  id: string;
  class_id: string;
  title: string;
  assignment_type: string;
  due_date: string | null;
  created_at: string | null;
  classes: { name: string } | null;
};
type AttemptRow = { assignment_id: string; status: string; percentage: number | null; predicted_grade: string | null };

/** Every assignment across the student's active classes, to-do first. Drafts
 *  never arrive: the student SELECT policy on `assignments` requires
 *  `status = 'published'`. */
export default function StudentAssignmentsPage() {
  const { session, isLoading } = useAuth();
  const supabase = createClient();

  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [attempts, setAttempts] = useState<Record<string, AttemptRow>>({});
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (isLoading || !session) return;

    let cancelled = false;
    const load = async () => {
      setPageLoading(true);

      const { data: memberships } = await supabase
        .from('class_students')
        .select('class_id')
        .eq('student_id', session.user.id)
        .eq('status', 'active');
      if (cancelled) return;
      const classIds = ((memberships ?? []) as Array<{ class_id: string }>).map((m) => m.class_id);

      if (classIds.length === 0) {
        setAssignments([]);
        setAttempts({});
        setPageLoading(false);
        return;
      }

      const [assignmentsResponse, attemptsResponse] = await Promise.all([
        supabase
          .from('assignments')
          .select('id, class_id, title, assignment_type, due_date, created_at, classes ( name )')
          .in('class_id', classIds),
        supabase
          .from('assignment_attempts')
          .select('assignment_id, status, percentage, predicted_grade')
          .eq('student_id', session.user.id),
      ]);
      if (cancelled) return;

      const map: Record<string, AttemptRow> = {};
      for (const row of (attemptsResponse.data as AttemptRow[]) ?? []) map[row.assignment_id] = row;
      setAttempts(map);
      setAssignments((assignmentsResponse.data as unknown as AssignmentRow[]) ?? []);
      setPageLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, supabase]);

  if (isLoading || pageLoading) {
    return <PageLoader text="Loading assignments..." />;
  }

  const isDone = (id: string) => attempts[id]?.status === 'completed';
  const toDo = assignments
    .filter((a) => !isDone(a.id))
    // Soonest due first; undated work after anything with a deadline.
    .sort((a, b) => (a.due_date ?? '￿').localeCompare(b.due_date ?? '￿'));
  const done = assignments
    .filter((a) => isDone(a.id))
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const ordered = [...toDo, ...done];

  const averagePercentage = done.length
    ? Math.round(done.reduce((sum, a) => sum + (attempts[a.id]?.percentage ?? 0), 0) / done.length)
    : null;

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Assignment report</PanelHeading>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="To do" value={toDo.length} tone={toDo.length > 0 ? 'warning' : 'default'} />
        <Stat label="Done" value={done.length} tone={done.length > 0 ? 'success' : 'default'} />
      </div>
      {assignments.length > 0 ? <Meter fraction={done.length / assignments.length} label="Assignments done" /> : null}
      <Stat
        label="Average score"
        value={averagePercentage === null ? '—' : `${averagePercentage}%`}
        hint="Across assignments you have finished"
      />
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={ClipboardList}
        eyebrow="Workspace / Assignments"
        title="Assignments"
        description="Work your teachers have set, across all your classes."
        actions={
          <>
            <Chip>● {assignments.length} assignments</Chip>
            {toDo.length > 0 ? <Chip tone="warning">{toDo.length} to do</Chip> : null}
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        <StatusBar>
          <h2 className="font-semibold text-content">All assignments</h2>
          <span>To do first, soonest due</span>
        </StatusBar>
        <div className="flex-1 p-5">
          {assignments.length === 0 ? (
            <p className="rounded-lg border border-dashed border-subtle bg-surface-sunken p-6 text-center text-sm text-content-muted">
              No assignments yet. Join a class from{' '}
              <Link href="/dashboard/classes" className="font-medium text-accent hover:underline">
                My Classes
              </Link>{' '}
              and your teacher&apos;s work will appear here.
            </p>
          ) : (
            <div className="space-y-2">
              {ordered.map((assignment) => {
                const attempt = attempts[assignment.id];
                const completed = attempt?.status === 'completed';
                return (
                  <Link
                    key={assignment.id}
                    href={`/dashboard/classes/${assignment.class_id}/assignments/${assignment.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-subtle bg-surface px-4 py-3 transition-colors hover:border-strong"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {completed ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                      ) : (
                        <Circle className="h-5 w-5 shrink-0 text-content-subtle" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-content">{assignment.title}</p>
                        <p className="font-mono text-[11px] text-content-subtle">
                          {assignment.classes?.name ?? 'Class'}
                          <span className="capitalize"> · {assignment.assignment_type}</span>
                          {assignment.due_date ? ` · due ${new Date(assignment.due_date).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                    </div>
                    {completed ? (
                      <span className="shrink-0 font-mono text-sm font-semibold text-content">
                        {Math.round(attempt.percentage ?? 0)}% · {attempt.predicted_grade}
                      </span>
                    ) : (
                      <Chip tone={attempt?.status === 'in_progress' ? 'warning' : 'inverse'}>
                        {attempt?.status === 'in_progress' ? 'Continue' : 'Start'}
                      </Chip>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </WorkspaceBody>
    </Workspace>
  );
}
