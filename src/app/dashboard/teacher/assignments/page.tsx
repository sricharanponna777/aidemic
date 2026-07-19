'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ClipboardList, Plus } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { scoreBarTone, scoreTextTone } from '@/lib/scoreTone';
import { PageLoader } from '@/components/PageLoader';
import { AssignmentForm, type CreatedAssignment } from '@/components/teacher/AssignmentForm';
import { buildAssignmentStats } from '@/lib/teacherAnalytics';

const selectClass =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100';

type ClassOption = {
  id: string;
  name: string;
  status: 'active' | 'archived';
  specification_id: string | null;
  specifications: {
    name: string;
    tier: string | null;
    subjects: {
      id: string;
      name: string;
      exam_boards: { name: string; qualifications: { name: string } | null } | null;
    } | null;
  } | null;
};

type AssignmentRow = {
  id: string;
  title: string;
  assignment_type: string;
  due_date: string | null;
  created_at: string | null;
  class_id: string;
  topic_id: string | null;
  topics: { name: string } | null;
};

type AttemptRow = {
  assignment_id: string;
  student_id: string;
  status: string;
  percentage: number | null;
  predicted_grade: string | null;
  completed_at: string | null;
  started_at: string | null;
};
type RosterRow = { id: string; student_id: string; class_id: string; joined_at: string | null; full_name: string | null; email: string | null };

export default function TeacherAssignmentsPage() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const supabase = createClient();

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);

  const [filterClassId, setFilterClassId] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (isLoading || !session) return;
    if (profile && profile.role !== 'teacher') {
      router.replace('/dashboard');
      return;
    }

    let cancelled = false;
    const load = async () => {
      setPageLoading(true);

      const { data: teacherRow } = await supabase.from('teachers').select('id').eq('user_id', session.user.id).maybeSingle();
      if (cancelled) return;
      if (!teacherRow) {
        router.replace('/onboarding/teacher');
        return;
      }
      const typedTeacherId = (teacherRow as { id: string }).id;
      setTeacherId(typedTeacherId);

      const { data: classRows } = await supabase
        .from('classes')
        .select(
          'id, name, status, specification_id, specifications ( name, tier, subjects ( id, name, exam_boards ( name, qualifications ( name ) ) ) )'
        )
        .eq('teacher_id', typedTeacherId)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      const classList = (classRows as unknown as ClassOption[]) ?? [];
      setClasses(classList);

      const classIds = classList.map((c) => c.id);
      if (classIds.length === 0) {
        setPageLoading(false);
        return;
      }

      const { data: assignmentRows } = await supabase
        .from('assignments')
        .select('id, title, assignment_type, due_date, created_at, class_id, topic_id, topics ( name )')
        .in('class_id', classIds)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      const assignmentList = (assignmentRows as unknown as AssignmentRow[]) ?? [];
      setAssignments(assignmentList);

      const assignmentIds = assignmentList.map((a) => a.id);
      if (assignmentIds.length > 0) {
        const { data: attemptRows } = await supabase
          .from('assignment_attempts')
          .select('assignment_id, student_id, status, percentage, predicted_grade, completed_at, started_at')
          .in('assignment_id', assignmentIds);
        if (!cancelled) setAttempts((attemptRows as AttemptRow[]) ?? []);
      }

      const { data: rosterRows } = await supabase
        .from('class_students')
        .select('id, student_id, class_id, joined_at')
        .in('class_id', classIds)
        .eq('status', 'active');
      const typedRosterRows = (rosterRows ?? []) as { id: string; student_id: string; class_id: string; joined_at: string | null }[];
      const studentIds = [...new Set(typedRosterRows.map((r) => r.student_id))];
      let profiles: { id: string; full_name: string | null; email: string | null }[] = [];
      if (studentIds.length > 0) {
        const { data: profileRows } = await supabase.from('user_profiles').select('id, full_name, email').in('id', studentIds);
        profiles = profileRows ?? [];
      }
      if (!cancelled) {
        setRoster(
          typedRosterRows.map((r) => {
            const p = profiles.find((prof) => prof.id === r.student_id);
            return {
              id: r.id,
              student_id: r.student_id,
              class_id: r.class_id,
              joined_at: r.joined_at,
              full_name: p?.full_name ?? null,
              email: p?.email ?? null,
            };
          })
        );
      }

      setPageLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, profile, router, supabase]);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const rosterByClass = useMemo(() => {
    const map = new Map<string, RosterRow[]>();
    for (const r of roster) {
      const entry = map.get(r.class_id) ?? [];
      entry.push(r);
      map.set(r.class_id, entry);
    }
    return map;
  }, [roster]);
  const attemptsByAssignment = useMemo(() => {
    const map = new Map<string, AttemptRow[]>();
    for (const a of attempts) {
      const entry = map.get(a.assignment_id) ?? [];
      entry.push(a);
      map.set(a.assignment_id, entry);
    }
    return map;
  }, [attempts]);

  const assignmentStats = useMemo(
    () => buildAssignmentStats({ classes, assignments, attempts, students: roster }),
    [classes, assignments, attempts, roster]
  );

  const visibleAssignments = filterClassId === 'all' ? assignments : assignments.filter((a) => a.class_id === filterClassId);
  const activeClasses = classes.filter((c) => c.status !== 'archived');

  const handleAssignmentCreated = (row: CreatedAssignment) => {
    setAssignments((prev) => [row, ...prev]);
    setShowForm(false);
  };

  if (isLoading || pageLoading) {
    return <PageLoader text="Loading assignments..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Assignments</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Create, schedule, and review assignments across all your classes.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          disabled={activeClasses.length === 0}
          className={buttonStyles({ variant: 'primary' })}
        >
          <Plus className="h-4 w-4" />
          Create assignment
        </button>
      </div>

      {classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/3 dark:text-slate-400">
          You need a class before you can create assignments.{' '}
          <Link href="/dashboard/teacher/classes" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Create a class
          </Link>
        </div>
      ) : (
        <>
          {showForm && teacherId && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
              <AssignmentForm
                teacherId={teacherId}
                classes={activeClasses}
                onCreated={handleAssignmentCreated}
                onCancel={() => setShowForm(false)}
              />
            </div>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">All assignments</h2>
              {classes.length > 1 && (
                <select value={filterClassId} onChange={(e) => setFilterClassId(e.target.value)} className={selectClass}>
                  <option value="all">All classes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {visibleAssignments.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No assignments yet.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {visibleAssignments.map((assignment) => {
                  const stats = assignmentStats.get(assignment.id);
                  const cls = classById.get(assignment.class_id);
                  const isExpanded = expandedId === assignment.id;
                  const classRoster = rosterByClass.get(assignment.class_id) ?? [];
                  const classAttempts = attemptsByAssignment.get(assignment.id) ?? [];
                  return (
                    <div key={assignment.id} className="rounded-lg border border-slate-200 dark:border-white/6">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : assignment.id)}
                        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left text-sm"
                      >
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">{assignment.title}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                            {cls?.name ?? 'Unknown class'}
                            {assignment.topics?.name ? ` · ${assignment.topics.name}` : ''}
                            {assignment.due_date ? ` · due ${new Date(assignment.due_date).toLocaleDateString()}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            {stats?.completedCount ?? 0}/{stats?.rosterSize ?? 0} completed
                          </span>
                          {stats?.avgScore !== null && stats?.avgScore !== undefined && (
                            <span className={`font-semibold ${scoreTextTone(stats.avgScore)}`}>{stats.avgScore}% avg</span>
                          )}
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </button>
                      {stats && stats.completionRate !== null && (
                        <div className="mx-4 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                          <div className={`h-full rounded-full ${scoreBarTone(stats.completionRate)}`} style={{ width: `${stats.completionRate}%` }} />
                        </div>
                      )}
                      {isExpanded && (
                        <div className="border-t border-slate-200 px-4 py-3 dark:border-white/6">
                          {classRoster.length === 0 ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400">No students in this class yet.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {classRoster.map((student) => {
                                const attempt = classAttempts.find((a) => a.student_id === student.student_id);
                                const status = attempt?.status ?? 'not started';
                                return (
                                  <div key={student.id} className="flex items-center justify-between text-xs">
                                    <span className="text-slate-700 dark:text-slate-300">{student.full_name || student.email || 'Student'}</span>
                                    <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                      <span className="capitalize">{status.replace('_', ' ')}</span>
                                      {typeof attempt?.percentage === 'number' && (
                                        <span className={`font-semibold ${scoreTextTone(attempt.percentage)}`}>{attempt.percentage}%</span>
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {classes.length > 0 && assignments.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:bg-white/3 dark:text-slate-400">
          <ClipboardList className="h-4 w-4 shrink-0" />
          Create your first assignment above — AIDemic generates the practice questions for you.
        </div>
      )}
    </div>
  );
}
