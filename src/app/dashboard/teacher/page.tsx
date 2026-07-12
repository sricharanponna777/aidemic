'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, ClipboardList, GraduationCap, Target, Users } from 'lucide-react';
import { VerificationBanner } from '@/components/VerificationBanner';
import { useTeacherClassData } from '@/hooks/useTeacherClassData';
import { atRiskStudents, average, buildClassStats, buildStudentStats } from '@/lib/teacherAnalytics';
import { scoreBarTone, scoreTextTone } from '@/lib/scoreTone';

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
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading your dashboard...</p>;
  }

  const stats = [
    { label: 'Classes', value: String(activeClassStats.length), icon: GraduationCap, from: 'from-indigo-500', to: 'to-purple-600' },
    { label: 'Students', value: String(studentCount), icon: Users, from: 'from-blue-500', to: 'to-cyan-500' },
    { label: 'Assignments', value: String(assignmentCount), icon: ClipboardList, from: 'from-emerald-500', to: 'to-teal-500' },
    { label: 'Avg. completion', value: avgCompletion === null ? '—' : `${avgCompletion}%`, icon: Target, from: 'from-amber-500', to: 'to-orange-500' },
  ];

  return (
    <div className="space-y-6">
      <VerificationBanner verificationStatus={verificationStatus} schoolStatus={schoolStatus} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Your at-a-glance overview across every class.</p>
      </div>

      {classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/3 dark:text-slate-400">
          You haven&apos;t created a class yet.{' '}
          <Link href="/dashboard/teacher/classes" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Create your first class
          </Link>{' '}
          to get started.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${stat.from} ${stat.to} shadow-md`}>
                  <stat.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Class summary */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E] lg:col-span-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Class summary</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Completion and average score per active class.</p>
              {activeClassStats.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No active classes.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {activeClassStats.map((cls) => (
                    <Link
                      key={cls.class_id}
                      href={`/dashboard/teacher/classes/${cls.class_id}`}
                      className="block rounded-xl border border-slate-200 px-4 py-3 transition hover:border-indigo-300 dark:border-white/6 dark:hover:border-indigo-500/40"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{cls.name}</span>
                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span>{cls.rosterSize} students</span>
                          <span>{cls.assignmentCount} assignments</span>
                          {cls.avgScore !== null && <span className={`font-semibold ${scoreTextTone(cls.avgScore)}`}>{cls.avgScore}% avg</span>}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
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
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Students needing help</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Not started or averaging below 40%.</p>
              {needingHelp.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Everyone is keeping up. 🎉</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {needingHelp.map((student) => (
                    <div key={`${student.class_id}:${student.student_id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-white/6">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800 dark:text-slate-200">{student.name}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{student.className}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                        <AlertTriangle className="h-3 w-3" />
                        {student.completedCount === 0 ? 'Not started' : `${student.avgScore}%`}
                      </span>
                    </div>
                  ))}
                  <Link href="/dashboard/teacher/ai-insights" className="mt-1 inline-block text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                    View all in AI Insights →
                  </Link>
                </div>
              )}
            </section>
          </div>

          {/* Today's activity */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Today&apos;s activity</h2>
              <span className="text-sm text-slate-500 dark:text-slate-400">{completedToday.length} completed today</span>
            </div>
            {completedToday.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No assignments completed yet today.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {completedToday.slice(0, 10).map((row) => (
                  <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm dark:border-white/6">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{row.name}</span>
                      <span className="text-slate-500 dark:text-slate-400"> completed </span>
                      <span className="text-slate-700 dark:text-slate-300">{row.assignmentTitle}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
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
