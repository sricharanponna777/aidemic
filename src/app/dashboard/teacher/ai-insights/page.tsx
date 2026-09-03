'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { AlertTriangle, HelpCircle, Lightbulb, Repeat, Sparkles, TrendingDown, Users } from 'lucide-react';
import { PageHero } from '@/components/ui/feedback';
import { buttonStyles } from '@/components/ui/button';
import { createClient } from '@/lib/supabase-client';
import { useTeacherClassData } from '@/hooks/useTeacherClassData';
import {
  atRiskStudents,
  buildClassStats,
  buildStudentStats,
  buildTopicStats,
  classSpreads,
  questionWeaknesses,
  repeatedConceptGaps,
  studentsNeedingAttention,
  SUPPORT_BAND_LABELS,
  WIDE_SPREAD_POINTS,
  type MarkingReportLike,
  type SupportBand,
} from '@/lib/teacherAnalytics';
import { normalizeInsightLabel } from '@/lib/weaknesses';
import { scoreBarTone, scoreTextTone } from '@/lib/scoreTone';

/**
 * Marking reports are fetched here rather than in `useTeacherClassData` because
 * `ai_feedback` is a large JSONB blob per attempt and the Dashboard and Reports
 * pages, which share that hook, have no use for it.
 */
type AttemptReportRow = { assignment_id: string; student_id: string; ai_feedback: MarkingReportLike };

const BAND_TONE: Record<SupportBand, string> = {
  not_started: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
  at_risk: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  needs_support: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  secure: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  strong: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
};

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

  const assignmentIds = useMemo(
    () => data.assignments.filter((a) => activeClassIds.has(a.class_id)).map((a) => a.id),
    [data.assignments, activeClassIds]
  );
  // The id list is joined into the SWR key so a re-render producing an equal
  // array does not refetch a payload this large.
  const { data: attemptReports } = useSWR(
    assignmentIds.length > 0 ? ['assignment-marking-reports', assignmentIds.join(',')] : null,
    async (): Promise<AttemptReportRow[]> => {
      const { data: rows } = await createClient()
        .from('assignment_attempts')
        .select('assignment_id, student_id, ai_feedback')
        .in('assignment_id', assignmentIds)
        .eq('status', 'completed');
      return (rows ?? []) as AttemptReportRow[];
    }
  );

  const scopedStudentStats = useMemo(
    () => studentStats.filter((s) => activeClassIds.has(s.class_id)),
    [studentStats, activeClassIds]
  );

  const needsAttention = useMemo(() => studentsNeedingAttention(scopedStudentStats), [scopedStudentStats]);

  const wideSpreads = useMemo(
    () => classSpreads(scopedStudentStats).filter((spread) => spread.range >= WIDE_SPREAD_POINTS),
    [scopedStudentStats]
  );

  const reportContext = useMemo(() => {
    const assignmentById = new Map(data.assignments.map((a) => [a.id, a]));
    const classNameById = new Map(classes.map((c) => [c.id, c.name]));
    return (attemptReports ?? []).flatMap((row) => {
      const assignment = assignmentById.get(row.assignment_id);
      if (!assignment) return [];
      return [{
        assignment_id: row.assignment_id,
        student_id: row.student_id,
        assignmentTitle: assignment.title,
        className: classNameById.get(assignment.class_id) ?? 'Class',
        report: row.ai_feedback,
      }];
    });
  }, [attemptReports, data.assignments, classes]);

  const weakQuestions = useMemo(() => questionWeaknesses(reportContext).slice(0, 6), [reportContext]);
  const conceptGaps = useMemo(
    () => repeatedConceptGaps(reportContext, normalizeInsightLabel).slice(0, 6),
    [reportContext]
  );

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

    // Everything below is what the old threshold-only view could not see. A class
    // of 86% and 67% cleared every cut-off above and produced "no pressing
    // issues", which is exactly the case these cover.
    const needsSupport = needsAttention.filter((s) => s.band === 'needs_support');
    if (needsSupport.length > 0) {
      const names = needsSupport.slice(0, 3).map((s) => s.name).join(', ');
      items.push({
        key: 'needs-support',
        text: `${needsSupport.length} student${needsSupport.length === 1 ? '' : 's'} sitting between 40% and 70% (${names}${needsSupport.length > 3 ? ', …' : ''}) — not at risk, but the clearest improvement opportunity you have.`,
      });
    }

    for (const spread of wideSpreads.slice(0, 2)) {
      items.push({
        key: `spread:${spread.class_id}`,
        text: `${spread.className} spans ${spread.low}%–${spread.high}% across ${spread.studentCount} students — a ${spread.range}-point gap that one lesson is unlikely to serve. Consider differentiated tasks.`,
      });
    }

    for (const question of weakQuestions.slice(0, 2)) {
      items.push({
        key: `question:${question.assignment_id}:${question.questionIndex}`,
        text: `Question ${question.questionIndex + 1} of "${question.assignmentTitle}" (${question.className}) averaged ${question.avgMarkPercent}% of its marks across ${question.attempts} scripts — worth walking through in class.`,
      });
    }

    for (const gap of conceptGaps.slice(0, 2)) {
      items.push({
        key: `gap:${gap.label}`,
        text: `"${gap.label}" came up for ${gap.students} different students — a shared gap rather than an individual slip.`,
      });
    }

    if (items.length === 0) {
      items.push({
        key: 'all-good',
        text: 'Nothing is flagging on scores, spread, question-level marks or repeated weaknesses. Keep setting regular practice to maintain momentum.',
      });
    }
    return items;
  }, [weakTopics, atRisk, needsAttention, wideSpreads, weakQuestions, conceptGaps]);

  if (loading) {
    return <p className="text-sm text-content-subtle">Analysing your classes...</p>;
  }

  const hasData = data.assignments.length > 0;

  return (
    <div className="space-y-6">
      <PageHero
        icon={Sparkles}
        title="AI Insights"
        description="Patterns surfaced across your classes to help you decide what to do next."
      />

      {classes.length === 0 || !hasData ? (
        <div className="rounded-2xl border border-dashed border-subtle bg-surface-sunken p-6 text-center text-sm text-content-subtle dark:bg-surface/3">
          Insights appear once your students start completing assignments.{' '}
          <Link href="/dashboard/teacher/assignments" className="font-medium text-accent hover:underline">
            Create an assignment
          </Link>
        </div>
      ) : (
        <>
          {/* AI-generated class summary */}
          <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <h2 className="text-lg font-semibold text-content">AI-generated summary</h2>
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
              <p className="mt-3 text-sm text-content-subtle">
                Generate a &ldquo;what to reteach this week&rdquo; summary written by AI from your classes&apos; current performance data.
              </p>
            ) : null}
            {summary && (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-medium text-content-muted dark:text-slate-200">{summary.headline}</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-content-muted dark:text-slate-300">
                  {summary.priorities.map((priority, index) => (
                    <li key={index}>{priority}</li>
                  ))}
                </ul>
                {summary.classNotes.length > 0 && (
                  <div className="space-y-1.5 border-t border-slate-100 pt-3 dark:border-white/6">
                    {summary.classNotes.map((note) => (
                      <p key={note.className} className="text-xs text-content-muted">
                        <span className="font-semibold text-content-muted dark:text-slate-200">{note.className}:</span> {note.note}
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
              <Lightbulb className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-semibold text-content">Suggested interventions</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-content-subtle dark:bg-surface/10">
                Rules-based
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {interventions.map((item) => (
                <div key={item.key} className="flex items-start justify-between gap-3 rounded-xl border border-white/60 bg-surface px-4 py-3 text-sm dark:border-white/6">
                  <p className="text-content-muted dark:text-slate-300">{item.text}</p>
                  {item.href && (
                    <Link href={item.href} className="shrink-0 text-xs font-medium text-accent hover:underline">
                      Set practice →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Weak topics */}
            <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-semibold text-content">Weak topics</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-content-subtle dark:bg-surface/10">
                  Rules-based
                </span>
              </div>
              <p className="mt-1 text-sm text-content-subtle">Topics scoring below 60% across your classes.</p>
              {weakTopics.length === 0 ? (
                <p className="mt-4 text-sm text-content-subtle">No weak topics — your classes are scoring well.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {weakTopics.map((topic) => (
                    <div key={topic.topic_id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-content-muted dark:text-slate-200">
                          {topic.name} <span className="text-xs font-normal text-content-subtle">· {topic.className}</span>
                        </span>
                        <span className={`font-semibold ${scoreTextTone(topic.avgScore)}`}>{topic.avgScore}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-surface/10">
                        <div className={`h-full rounded-full ${scoreBarTone(topic.avgScore)}`} style={{ width: `${topic.avgScore ?? 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Students needing attention */}
            <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-semibold text-content">Students needing attention</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-content-subtle dark:bg-surface/10">
                  Rules-based
                </span>
              </div>
              <p className="mt-1 text-sm text-content-subtle">
                Banded rather than pass/fail, so students who are coping but not thriving still appear.
              </p>
              {needsAttention.length === 0 ? (
                <p className="mt-4 text-sm text-content-subtle">
                  Every student who has started is averaging 70% or above.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {needsAttention.slice(0, 10).map((student) => (
                    <div key={`${student.class_id}:${student.student_id}`} className="flex items-center justify-between gap-2 rounded-lg border border-subtle px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-content-muted dark:text-slate-200">{student.name}</p>
                        <p className="truncate text-xs text-content-subtle">
                          {student.className} · {student.completedCount}/{student.assignedCount} done
                          {student.completedCount > 0 && student.avgScore !== null ? ` · ${student.avgScore}% avg` : ''}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${BAND_TONE[student.band]}`}>
                        {SUPPORT_BAND_LABELS[student.band]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Question-level weaknesses */}
            <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-sky-500" />
                <h2 className="text-lg font-semibold text-content">Hardest questions</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-content-subtle dark:bg-surface/10">
                  Rules-based
                </span>
              </div>
              <p className="mt-1 text-sm text-content-subtle">
                Where marks were actually lost. A class can average well overall and still drop the same question every time.
              </p>
              {weakQuestions.length === 0 ? (
                <p className="mt-4 text-sm text-content-subtle">
                  No individual question is averaging below 70% of its marks across two or more scripts yet.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {weakQuestions.map((question) => (
                    <div key={`${question.assignment_id}:${question.questionIndex}`}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 font-medium text-content-muted dark:text-slate-200">
                          <span className="truncate">Q{question.questionIndex + 1} · {question.assignmentTitle}</span>{' '}
                          <span className="text-xs font-normal text-content-subtle">· {question.className}</span>
                        </span>
                        <span className={`shrink-0 font-semibold ${scoreTextTone(question.avgMarkPercent)}`}>
                          {question.avgMarkPercent}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-surface/10">
                        <div className={`h-full rounded-full ${scoreBarTone(question.avgMarkPercent)}`} style={{ width: `${question.avgMarkPercent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Repeated concept gaps */}
            <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Repeat className="h-5 w-5 text-purple-500" />
                <h2 className="text-lg font-semibold text-content">Shared misconceptions</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-content-subtle dark:bg-surface/10">
                  Rules-based
                </span>
              </div>
              <p className="mt-1 text-sm text-content-subtle">
                Weaknesses the marker flagged for more than one student — a reteach rather than an individual slip.
              </p>
              {conceptGaps.length === 0 ? (
                <p className="mt-4 text-sm text-content-subtle">
                  No weakness has been flagged for two or more students yet.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {conceptGaps.map((gap) => (
                    <div key={gap.label} className="flex items-center justify-between gap-3 rounded-lg border border-subtle px-3 py-2 text-sm">
                      <p className="min-w-0 truncate font-medium text-content-muted dark:text-slate-200">{gap.label}</p>
                      <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                        {gap.students} students
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Attainment spread */}
            <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-teal-500" />
                <h2 className="text-lg font-semibold text-content">Attainment spread</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-content-subtle dark:bg-surface/10">
                  Rules-based
                </span>
              </div>
              <p className="mt-1 text-sm text-content-subtle">
                Classes with at least a {WIDE_SPREAD_POINTS}-point gap between the highest and lowest average.
              </p>
              {wideSpreads.length === 0 ? (
                <p className="mt-4 text-sm text-content-subtle">
                  No class is spread more than {WIDE_SPREAD_POINTS} points — one lesson should serve each of them.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {wideSpreads.slice(0, 6).map((spread) => (
                    <div key={spread.class_id} className="flex items-center justify-between gap-3 rounded-lg border border-subtle px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-content-muted dark:text-slate-200">{spread.className}</p>
                        <p className="truncate text-xs text-content-subtle">
                          {spread.low}%–{spread.high}% across {spread.studentCount} students
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
                        {spread.range} pts
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
