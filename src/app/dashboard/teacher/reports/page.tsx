'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTeacherClassData } from '@/hooks/useTeacherClassData';
import { buildClassStats, buildStudentStats, buildTopicStats } from '@/lib/teacherAnalytics';
import { scoreBadgeTone, scoreBarTone, scoreTextTone } from '@/lib/scoreTone';

type Tab = 'class' | 'individual' | 'predictions';

const TABS: { id: Tab; label: string }[] = [
  { id: 'class', label: 'Class reports' },
  { id: 'individual', label: 'Individual reports' },
  { id: 'predictions', label: 'Grade predictions' },
];

export default function TeacherReportsPage() {
  const data = useTeacherClassData();
  const { loading, classes, assignments, attempts } = data;

  const [tab, setTab] = useState<Tab>('class');
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');

  const classStats = useMemo(() => (loading ? [] : buildClassStats(data)), [loading, data]);
  const studentStats = useMemo(() => (loading ? [] : buildStudentStats(data)), [loading, data]);

  const activeClasses = classes.filter((c) => c.status !== 'archived');
  const effectiveClassId = classId || activeClasses[0]?.id || '';
  const topicStats = useMemo(
    () => (loading || !effectiveClassId ? [] : buildTopicStats(data, effectiveClassId)),
    [loading, data, effectiveClassId]
  );
  const classStudents = studentStats.filter((s) => s.class_id === effectiveClassId);
  const effectiveStudentId = studentId || classStudents[0]?.student_id || '';
  const selectedStudent = classStudents.find((s) => s.student_id === effectiveStudentId);

  const studentAssignments =
    !effectiveClassId || !effectiveStudentId
      ? []
      : assignments
          .filter((a) => a.class_id === effectiveClassId)
          .map((a) => {
            const attempt = attempts.find((att) => att.assignment_id === a.id && att.student_id === effectiveStudentId);
            return {
              id: a.id,
              title: a.title,
              topic: a.topics?.name ?? null,
              status: attempt?.status ?? 'not_started',
              percentage: attempt?.percentage ?? null,
              predictedGrade: attempt?.predicted_grade ?? null,
            };
          });

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading reports...</p>;
  }

  const selectClass =
    'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reports</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Deep-dive performance reports for students and classes.</p>
      </div>

      {classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/3 dark:text-slate-400">
          You need a class with assignments before reports appear.{' '}
          <Link href="/dashboard/teacher/classes" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Create a class
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  tab === t.id
                    ? 'bg-linear-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/6'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Class reports */}
          {tab === 'class' && (
            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">All classes</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-130 text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-white/6 dark:text-slate-400">
                        <th className="pb-2 pr-4 font-medium">Class</th>
                        <th className="pb-2 pr-4 font-medium">Students</th>
                        <th className="pb-2 pr-4 font-medium">Assignments</th>
                        <th className="pb-2 pr-4 font-medium">Completion</th>
                        <th className="pb-2 font-medium">Avg. score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classStats.map((cls) => (
                        <tr key={cls.class_id} className="border-b border-slate-100 last:border-0 dark:border-white/4">
                          <td className="py-2.5 pr-4">
                            <Link href={`/dashboard/teacher/classes/${cls.class_id}`} className="font-medium text-slate-900 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400">
                              {cls.name}
                            </Link>
                            {cls.status === 'archived' && <span className="ml-2 text-[10px] uppercase text-slate-400">archived</span>}
                          </td>
                          <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">{cls.rosterSize}</td>
                          <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">{cls.assignmentCount}</td>
                          <td className="py-2.5 pr-4">
                            <span className={`font-semibold ${scoreTextTone(cls.completionRate)}`}>{cls.completionRate === null ? '—' : `${cls.completionRate}%`}</span>
                          </td>
                          <td className="py-2.5">
                            <span className={`font-semibold ${scoreTextTone(cls.avgScore)}`}>{cls.avgScore === null ? '—' : `${cls.avgScore}%`}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Topic breakdown</h2>
                  <select value={effectiveClassId} onChange={(e) => setClassId(e.target.value)} className={selectClass}>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                {topicStats.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No assignments in this class yet.</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {topicStats.map((topic) => (
                      <div key={topic.topic_id}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{topic.name}</span>
                          <span className={`font-semibold ${scoreTextTone(topic.avgScore)}`}>
                            {topic.avgScore === null ? 'No completed attempts' : `${topic.avgScore}% avg`}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                          <div className={`h-full rounded-full ${scoreBarTone(topic.avgScore)}`} style={{ width: `${topic.avgScore ?? 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Individual reports */}
          {tab === 'individual' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
              <div className="flex flex-wrap items-center gap-2">
                <select value={effectiveClassId} onChange={(e) => { setClassId(e.target.value); setStudentId(''); }} className={selectClass}>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select value={effectiveStudentId} onChange={(e) => setStudentId(e.target.value)} disabled={classStudents.length === 0} className={selectClass}>
                  {classStudents.length === 0 ? (
                    <option value="">No students</option>
                  ) : (
                    classStudents.map((s) => (
                      <option key={s.student_id} value={s.student_id}>
                        {s.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {!selectedStudent ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No students have joined this class yet.</p>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-white/6">
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        {selectedStudent.completedCount}/{selectedStudent.assignedCount}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Completed</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-white/6">
                      <p className={`text-2xl font-bold ${scoreTextTone(selectedStudent.avgScore)}`}>{selectedStudent.avgScore === null ? '—' : `${selectedStudent.avgScore}%`}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Avg. score</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-white/6">
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">{selectedStudent.predictedGrade ?? '—'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Predicted grade</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-white/6">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {selectedStudent.lastActivity ? selectedStudent.lastActivity.toLocaleDateString() : '—'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Last active</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {studentAssignments.map((a) => (
                      <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm dark:border-white/6">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">{a.title}</p>
                          {a.topic && <p className="text-xs text-slate-500 dark:text-slate-400">{a.topic}</p>}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {a.predictedGrade && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">Grade {a.predictedGrade}</span>}
                          {a.status === 'completed' ? (
                            <span className={`rounded-full px-2 py-0.5 font-semibold ${scoreBadgeTone(a.percentage)}`}>{a.percentage === null ? 'Done' : `${a.percentage}%`}</span>
                          ) : (
                            <span className="capitalize text-slate-400 dark:text-slate-500">{a.status.replace('_', ' ')}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {studentAssignments.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No assignments in this class yet.</p>}
                  </div>
                </>
              )}
            </section>
          )}

          {/* Grade predictions */}
          {tab === 'predictions' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Grade predictions</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Most recent predicted grade per student, from their completed assignments.
              </p>
              {studentStats.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No students have joined your classes yet.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-130 text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-white/6 dark:text-slate-400">
                        <th className="pb-2 pr-4 font-medium">Student</th>
                        <th className="pb-2 pr-4 font-medium">Class</th>
                        <th className="pb-2 pr-4 font-medium">Completed</th>
                        <th className="pb-2 pr-4 font-medium">Avg. score</th>
                        <th className="pb-2 font-medium">Predicted grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentStats.map((s) => (
                        <tr key={`${s.class_id}:${s.student_id}`} className="border-b border-slate-100 last:border-0 dark:border-white/4">
                          <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-slate-100">{s.name}</td>
                          <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">{s.className}</td>
                          <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">{s.completedCount}/{s.assignedCount}</td>
                          <td className="py-2.5 pr-4">
                            <span className={`font-semibold ${scoreTextTone(s.avgScore)}`}>{s.avgScore === null ? '—' : `${s.avgScore}%`}</span>
                          </td>
                          <td className="py-2.5">
                            {s.predictedGrade ? (
                              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{s.predictedGrade}</span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
