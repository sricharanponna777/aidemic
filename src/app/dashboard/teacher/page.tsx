'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, ClipboardList, GraduationCap, LayoutDashboard, Target, Users } from 'lucide-react';
import { PageHero } from '@/components/ui/feedback';
import { VerificationBanner } from '@/components/VerificationBanner';
import { useTeacherClassData } from '@/hooks/useTeacherClassData';
import { atRiskStudents, average, buildClassStats, buildStudentStats } from '@/lib/teacherAnalytics';
import { scoreBarTone, scoreTextTone } from '@/lib/scoreTone';
import { PageLoader } from '@/components/PageLoader';
import { GetStartedChecklist } from '@/components/GetStartedChecklist';
import { buildTeacherChecklist } from '@/lib/onboarding/checklist';

function isToday(date: Date) {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

export default function TeacherDashboardPage() {
  const data = useTeacherClassData();
  const { loading, verificationStatus, schoolStatus, classes, assignments, attempts, students } = data;

  const classStats = useMemo(() => (loading ? [] : buildClassStats(data)), [loading, data]);
  const studentStats = useMemo(() => (loading ? [] : buildStudentStats(data)), [loading, data]);

  const activeClassStats = useMemo(() => classStats.filter((c) => c.status !== 'archived'), [classStats]);
  const activeClassIds = useMemo(() => new Set(activeClassStats.map((c) => c.class_id)), [activeClassStats]);
  const studentCount = students.filter((s) => activeClassIds.has(s.class_id)).length;
  const assignmentCount = assignments.filter((a) => activeClassIds.has(a.class_id)).length;
  const avgCompletion = average(activeClassStats.map((c) => c.completionRate).filter((v): v is number => v !== null));

  const needingHelp = useMemo(
    () => atRiskStudents(studentStats.filter((s) => activeClassIds.has(s.class_id))).slice(0, 6),
    [studentStats, activeClassIds]
  );

  const completedToday = useMemo(() => {
    const rows = attempts
      .filter((a) => a.status === 'completed' && a.completed_at && isToday(new Date(a.completed_at)))
      .map((a) => {
        const student = students.find((s) => s.student_id === a.student_id);
        const assignment = assignments.find((as) => as.id === a.assignment_id);
        return {
          key: `${a.assignment_id}:${a.student_id}`,
          name: student?.full_name || student?.email || 'Student',
          assignmentTitle: assignment?.title ?? 'Assignment',
          percentage: a.percentage,
          at: new Date(a.completed_at as string),
        };
      })
      .sort((a, b) => b.at.getTime() - a.at.getTime());
    return rows;
  }, [attempts, students, assignments]);

  if (loading) {
    return <PageLoader text="Loading your dashboard..." />;
  }

  const checklist = buildTeacherChecklist({
    classCount: activeClassStats.length,
    studentCount,
    assignmentCount,
    markedAttemptCount: attempts.filter((a) => a.status === 'completed').length,
  });

  const stats = [
    { label: 'Classes', value: String(activeClassStats.length), icon: GraduationCap, from: 'from-indigo-500', to: 'to-purple-600' },
    { label: 'Students', value: String(studentCount), icon: Users, from: 'from-blue-500', to: 'to-cyan-500' },
    { label: 'Assignments', value: String(assignmentCount), icon: ClipboardList, from: 'from-emerald-500', to: 'to-teal-500' },
    { label: 'Avg. completion', value: avgCompletion === null ? '—' : `${avgCompletion}%`, icon: Target, from: 'from-amber-500', to: 'to-orange-500' },
  ];

  return (
    <div className="space-y-6">
      <VerificationBanner verificationStatus={verificationStatus} schoolStatus={schoolStatus} />

      <PageHero
        icon={LayoutDashboard}
        title="Dashboard"
        description="Your at-a-glance overview across every class."
      />

      <GetStartedChecklist items={checklist} />

      {classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-subtle bg-surface-sunken p-6 text-center text-sm text-content-subtle dark:bg-surface/3">
          You haven&apos;t created a class yet.{' '}
          <Link href="/dashboard/teacher/classes" className="font-medium text-accent hover:underline">
            Create your first class
          </Link>{' '}
          to get started.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="flex items-center gap-3 rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${stat.from} ${stat.to} shadow-md`}>
                  <stat.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-content dark:text-white">{stat.value}</p>
                  <p className="text-xs text-content-subtle">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Class summary */}
            <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm lg:col-span-2">
              <h2 className="text-lg font-semibold text-content">Class summary</h2>
              <p className="mt-1 text-sm text-content-subtle">Completion and average score per active class.</p>
              {activeClassStats.length === 0 ? (
                <p className="mt-4 text-sm text-content-subtle">No active classes.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {activeClassStats.map((cls) => (
                    <Link
                      key={cls.class_id}
                      href={`/dashboard/teacher/classes/${cls.class_id}`}
                      className="block rounded-xl border border-subtle px-4 py-3 transition hover:border-indigo-300 dark:hover:border-indigo-500/40"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-content">{cls.name}</span>
                        <div className="flex items-center gap-3 text-xs text-content-subtle">
                          <span>{cls.rosterSize} students</span>
                          <span>{cls.assignmentCount} assignments</span>
                          {cls.avgScore !== null && <span className={`font-semibold ${scoreTextTone(cls.avgScore)}`}>{cls.avgScore}% avg</span>}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-surface/10">
                          <div className={`h-full rounded-full ${scoreBarTone(cls.completionRate)}`} style={{ width: `${cls.completionRate ?? 0}%` }} />
                        </div>
                        <span className={`text-xs font-semibold ${scoreTextTone(cls.completionRate)}`}>
                          {cls.completionRate === null ? '—' : `${cls.completionRate}%`}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Students needing help */}
            <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-content">Students needing help</h2>
              <p className="mt-1 text-sm text-content-subtle">Not started or averaging below 40%.</p>
              {needingHelp.length === 0 ? (
                <p className="mt-4 text-sm text-content-subtle">Everyone is keeping up. 🎉</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {needingHelp.map((student) => (
                    <div key={`${student.class_id}:${student.student_id}`} className="flex items-center justify-between gap-2 rounded-lg border border-subtle px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-content-muted dark:text-slate-200">{student.name}</p>
                        <p className="truncate text-xs text-content-subtle">{student.className}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                        <AlertTriangle className="h-3 w-3" />
                        {student.completedCount === 0 ? 'Not started' : `${student.avgScore}%`}
                      </span>
                    </div>
                  ))}
                  <Link href="/dashboard/teacher/ai-insights" className="mt-1 inline-block text-xs font-medium text-accent hover:underline">
                    View all in AI Insights →
                  </Link>
                </div>
              )}
            </section>
          </div>

          {/* Today's activity */}
          <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-content">Today&apos;s activity</h2>
              <span className="text-sm text-content-subtle">{completedToday.length} completed today</span>
            </div>
            {completedToday.length === 0 ? (
              <p className="mt-4 text-sm text-content-subtle">No assignments completed yet today.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {completedToday.slice(0, 10).map((row) => (
                  <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-subtle px-4 py-2.5 text-sm">
                    <div>
                      <span className="font-medium text-content">{row.name}</span>
                      <span className="text-content-subtle"> completed </span>
                      <span className="text-content-muted dark:text-slate-300">{row.assignmentTitle}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-content-subtle">
                      {typeof row.percentage === 'number' && <span className={`font-semibold ${scoreTextTone(row.percentage)}`}>{row.percentage}%</span>}
                      <span>{row.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
