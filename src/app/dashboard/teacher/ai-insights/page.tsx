'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Lightbulb, Sparkles, TrendingDown } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { useTeacherClassData } from '@/hooks/useTeacherClassData';
import { atRiskStudents, buildClassStats, buildStudentStats, buildTopicStats } from '@/lib/teacherAnalytics';
import { scoreBarTone, scoreTextTone } from '@/lib/scoreTone';

type Intervention = { key: string; text: string; href?: string };
type ClassSummary = { headline: string; priorities: string[]; classNotes: { className: string; note: string }[] };

export default function TeacherAiInsightsPage() {
  const data = useTeacherClassData();
  const { loading, classes } = data;

  const [summary, setSummary] = useState<ClassSummary | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  const topicStats = useMemo(() => (loading ? [] : buildTopicStats(data)), [loading, data]);
  const studentStats = useMemo(() => (loading ? [] : buildStudentStats(data)), [loading, data]);
  const classStats = useMemo(() => (loading ? [] : buildClassStats(data)), [loading, data]);

  const activeClassIds = useMemo(() => new Set(classes.filter((c) => c.status !== 'archived').map((c) => c.id)), [classes]);

  // Weak topics: only those with completed attempts, scoring below the pass line, weakest first.
  const weakTopics = useMemo(
    () => topicStats.filter((t) => t.completedAttempts > 0 && t.avgScore !== null && t.avgScore < 60).slice(0, 8),
    [topicStats]
  );

  const atRisk = useMemo(
    () => atRiskStudents(studentStats.filter((s) => activeClassIds.has(s.class_id))),
    [studentStats, activeClassIds]
  );

  const classSummaryInput = useMemo(
    () =>
      classStats
        .filter((c) => activeClassIds.has(c.class_id))
        .map((c) => {
          const classAtRisk = atRisk.filter((s) => s.class_id === c.class_id);
          return {
            className: c.name,
            avgScore: c.avgScore,
            completionRate: c.completionRate,
            weakTopics: topicStats
              .filter((t) => t.className === c.name && t.avgScore !== null && t.avgScore < 60)
              .map((t) => ({ name: t.name, avgScore: t.avgScore as number })),
            atRiskCount: classAtRisk.filter((s) => s.completedCount > 0).length,
            notStartedCount: classAtRisk.filter((s) => s.completedCount === 0).length,
          };
        }),
    [classStats, activeClassIds, topicStats, atRisk]
  );

  const handleGenerateSummary = async () => {
    setSummaryError('');
    setIsGeneratingSummary(true);
    try {
      const response = await fetch('/api/ai/generate-class-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classes: classSummaryInput }),
      });
      const body = await response.json();
      if (!response.ok) {
        setSummaryError(body.error || 'Failed to generate summary.');
        return;
      }
      setSummary(body as ClassSummary);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Failed to generate summary.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const interventions = useMemo<Intervention[]>(() => {
    const items: Intervention[] = [];
    for (const topic of weakTopics.slice(0, 3)) {
      items.push({
        key: `topic:${topic.topic_id}`,
        text: `Re-teach or set targeted practice on "${topic.name}" in ${topic.className} — the class is averaging ${topic.avgScore}%.`,
        href: '/dashboard/teacher/assignments',
      });
    }
    const notStarted = atRisk.filter((s) => s.completedCount === 0);
    if (notStarted.length > 0) {
      items.push({
        key: 'not-started',
        text: `${notStarted.length} student${notStarted.length === 1 ? ' has' : 's have'} not started any assignment yet — a nudge or a check-in could help.`,
      });
    }
    const lowScorers = atRisk.filter((s) => s.completedCount > 0 && s.avgScore !== null && s.avgScore < 40);
    if (lowScorers.length > 0) {
      items.push({
        key: 'low-scorers',
        text: `${lowScorers.length} student${lowScorers.length === 1 ? ' is' : 's are'} averaging below 40% — consider one-to-one support or easier scaffolding.`,
      });
    }
    if (items.length === 0) {
      items.push({ key: 'all-good', text: 'No pressing issues detected. Keep setting regular practice to maintain momentum.' });
    }
    return items;
  }, [weakTopics, atRisk]);

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Analysing your classes...</p>;
  }

  const hasData = data.assignments.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">AI Insights</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Patterns surfaced across your classes to help you decide what to do next.</p>
      </div>

      {classes.length === 0 || !hasData ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/3 dark:text-slate-400">
          Insights appear once your students start completing assignments.{' '}
          <Link href="/dashboard/teacher/assignments" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Create an assignment
          </Link>
        </div>
      ) : (
        <>
          {/* AI-generated class summary */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">AI-generated summary</h2>
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                  AI-generated
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleGenerateSummary()}
                disabled={isGeneratingSummary}
                className={buttonStyles({ variant: 'primary', size: 'sm' })}
              >
                {isGeneratingSummary ? 'Generating...' : summary ? 'Regenerate summary' : 'Generate AI summary'}
              </button>
            </div>
            {summaryError ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{summaryError}</p> : null}
            {!summary && !summaryError ? (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Generate a &ldquo;what to reteach this week&rdquo; summary written by AI from your classes&apos; current performance data.
              </p>
            ) : null}
            {summary && (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{summary.headline}</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
                  {summary.priorities.map((priority, index) => (
                    <li key={index}>{priority}</li>
                  ))}
                </ul>
                {summary.classNotes.length > 0 && (
                  <div className="space-y-1.5 border-t border-slate-100 pt-3 dark:border-white/6">
                    {summary.classNotes.map((note) => (
                      <p key={note.className} className="text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{note.className}:</span> {note.note}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Suggested interventions */}
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-6 shadow-sm dark:border-indigo-500/20 dark:bg-indigo-500/5">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Suggested interventions</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">
                Rules-based
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {interventions.map((item) => (
                <div key={item.key} className="flex items-start justify-between gap-3 rounded-xl border border-white/60 bg-white px-4 py-3 text-sm dark:border-white/6 dark:bg-[#131B2E]">
                  <p className="text-slate-700 dark:text-slate-300">{item.text}</p>
                  {item.href && (
                    <Link href={item.href} className="shrink-0 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                      Set practice →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Weak topics */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Weak topics</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">
                  Rules-based
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Topics scoring below 60% across your classes.</p>
              {weakTopics.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No weak topics — your classes are scoring well.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {weakTopics.map((topic) => (
                    <div key={topic.topic_id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {topic.name} <span className="text-xs font-normal text-slate-400">· {topic.className}</span>
                        </span>
                        <span className={`font-semibold ${scoreTextTone(topic.avgScore)}`}>{topic.avgScore}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                        <div className={`h-full rounded-full ${scoreBarTone(topic.avgScore)}`} style={{ width: `${topic.avgScore ?? 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Students at risk */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Students at risk</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">
                  Rules-based
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Not started, or averaging below 40%.</p>
              {atRisk.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No students currently at risk. 🎉</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {atRisk.slice(0, 10).map((student) => (
                    <div key={`${student.class_id}:${student.student_id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-white/6">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800 dark:text-slate-200">{student.name}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {student.className} · {student.completedCount}/{student.assignedCount} done
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                        {student.completedCount === 0 ? 'Not started' : `${student.avgScore}% avg`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
