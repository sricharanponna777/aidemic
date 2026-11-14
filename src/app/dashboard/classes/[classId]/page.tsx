'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Circle, Radar, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { PageLoader } from '@/components/PageLoader';
import { PageHeader } from '@/components/ui/feedback';
import { Chip, Meter, PanelHeading, Stat, StatusBar, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
// GAMIFICATION PAUSED: import { ClassLeaderboard } from '@/components/gamification/ClassLeaderboard';

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
    return <PageLoader text="Loading class..." />;
  }

  const completedAttempts = assignments
    .map((assignment) => attempts[assignment.id])
    .filter((attempt) => attempt?.status === 'completed');
  const averagePercentage = completedAttempts.length
    ? Math.round(completedAttempts.reduce((sum, attempt) => sum + (attempt.percentage ?? 0), 0) / completedAttempts.length)
    : null;

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Class report</PanelHeading>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Assignments" value={assignments.length} />
        <Stat label="Done" value={completedAttempts.length} tone={completedAttempts.length > 0 ? 'success' : 'default'} />
      </div>
      {assignments.length > 0 ? (
        <Meter fraction={completedAttempts.length / assignments.length} label="Assignments done" />
      ) : null}
      <Stat label="Average score" value={averagePercentage === null ? '—' : `${averagePercentage}%`} hint="Across assignments you have finished" />
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={Users}
        eyebrow="Classes / Class"
        title={classInfo.name}
        backHref="/dashboard/classes"
        backLabel="My Classes"
        actions={
          <>
            <Chip>● {assignments.length} assignments</Chip>
            {assignments.length - completedAttempts.length > 0 ? (
              <Chip tone="warning">{assignments.length - completedAttempts.length} to do</Chip>
            ) : null}
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        <StatusBar>
          <h2 className="font-semibold text-content">Assignments</h2>
          <span>Newest first</span>
        </StatusBar>
        <div className="flex-1 p-5">
          {assignments.length === 0 ? (
            <p className="rounded-lg border border-dashed border-subtle bg-surface-sunken p-6 text-center text-sm text-content-muted">
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
                        <p className="font-mono text-[11px] capitalize text-content-subtle">
                          {assignment.assignment_type}
                          {assignment.due_date ? ` · due ${new Date(assignment.due_date).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                    </div>
                    {completed ? (
                      <span className="shrink-0 font-mono text-sm font-semibold text-content">
                        {Math.round(attempt.percentage ?? 0)}% · {attempt.predicted_grade}
                      </span>
                    ) : (
                      <Chip tone="inverse">Start</Chip>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </WorkspaceBody>

      {/* GAMIFICATION PAUSED: <ClassLeaderboard classId={classId} /> */}
    </Workspace>
  );
}
