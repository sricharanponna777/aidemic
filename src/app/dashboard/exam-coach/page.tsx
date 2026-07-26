'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Compass, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { RevisionCycleStepper } from '@/components/RevisionCycleStepper';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ToastProvider';
import { createClient } from '@/lib/supabase-client';
import { getSubjectLabel } from '@/lib/ai/subjectConfig';

const ATTEMPT_LOOKBACK = 40;
const RECENT_WINDOW = 5;

const BAND_ORDER = ['No credit yet', 'Limited', 'Developing', 'Secure', 'Top band'];
const BAND_COLORS: Record<string, string> = {
  'No credit yet': 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  Limited: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  Developing: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  Secure: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  'Top band': 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
};

type MarkedAnswer = { band?: string; weaknessTags?: string[] };
type MarkingReport = { markedAnswers?: MarkedAnswer[] };

type AttemptRow = {
  id: string;
  subject: string;
  percentage: number | null;
  weakness_tags: string[] | null;
  weakness_analysis: string[] | null;
  marking_report: MarkingReport | null;
  created_at: string | null;
};

type CoachResult = { headline: string; patterns: string[]; nextSteps: string[] };

const normalizeInsightLabel = (value: string) =>
  value
    .replace(/^Main pattern to fix:\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim()
    .slice(0, 90);

export default function ExamCoachPage() {
  const { session } = useAuth();
  const { showToast } = useToast();
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [report, setReport] = useState<CoachResult | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('exam_practice_attempts')
          .select('id, subject, percentage, weakness_tags, weakness_analysis, marking_report, created_at')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(ATTEMPT_LOOKBACK);
        if (error) throw error;
        setAttempts((data as AttemptRow[]) ?? []);
      } catch (err) {
        console.error('Failed to load attempts for exam coach', err);
        setAttempts([]);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [session?.user?.id]);

  const analysis = useMemo(() => {
    const bandCounts = new Map<string, number>();
    const weaknessMap = new Map<string, { count: number; subjects: Set<string> }>();
    const subjectGroups = new Map<string, AttemptRow[]>();
    let totalQuestions = 0;

    for (const attempt of attempts) {
      subjectGroups.set(attempt.subject, [...(subjectGroups.get(attempt.subject) ?? []), attempt]);

      const markedAnswers = attempt.marking_report?.markedAnswers ?? [];
      for (const answer of markedAnswers) {
        totalQuestions += 1;
        if (answer.band) bandCounts.set(answer.band, (bandCounts.get(answer.band) || 0) + 1);
      }

      const rawInsights = (attempt.weakness_tags?.length ? attempt.weakness_tags : attempt.weakness_analysis) ?? [];
      for (const tag of rawInsights) {
        const norm = normalizeInsightLabel(tag);
        if (!norm) continue;
        const entry = weaknessMap.get(norm) ?? { count: 0, subjects: new Set<string>() };
        entry.count += 1;
        entry.subjects.add(attempt.subject);
        weaknessMap.set(norm, entry);
      }
    }

    const bandDistribution = BAND_ORDER
      .map((band) => ({ band, count: bandCounts.get(band) || 0 }))
      .filter((entry) => entry.count > 0);

    const topWeaknesses = [...weaknessMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([tag, { count, subjects }]) => ({ tag, count, subjects: [...subjects] }));

    const subjectStats = [...subjectGroups.entries()].map(([subject, group]) => {
      const sorted = [...group].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      const withPct = sorted.filter((a) => typeof a.percentage === 'number');
      const avgPercentage = withPct.length > 0
        ? Math.round(withPct.reduce((sum, a) => sum + (a.percentage || 0), 0) / withPct.length)
        : 0;
      const recent = withPct.slice(0, RECENT_WINDOW);
      const earlier = withPct.slice(RECENT_WINDOW, RECENT_WINDOW * 2);
      const recentAvg = recent.length > 0 ? recent.reduce((s, a) => s + (a.percentage || 0), 0) / recent.length : null;
      const earlierAvg = earlier.length > 0 ? earlier.reduce((s, a) => s + (a.percentage || 0), 0) / earlier.length : null;
      const trend: 'improving' | 'declining' | 'steady' =
        recentAvg !== null && earlierAvg !== null && recentAvg - earlierAvg >= 5
          ? 'improving'
          : recentAvg !== null && earlierAvg !== null && earlierAvg - recentAvg >= 5
            ? 'declining'
            : 'steady';
      return { subject, attempts: group.length, avgPercentage, trend };
    });

    return { bandDistribution, topWeaknesses, subjectStats, totalQuestions };
  }, [attempts]);

  const handleGenerate = async () => {
    if (attempts.length === 0) return;
    setIsGenerating(true);
    setReport(null);
    try {
      const response = await fetch('/api/ai/exam-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalAttempts: attempts.length,
          totalQuestionsAnalyzed: analysis.totalQuestions,
          bandDistribution: analysis.bandDistribution,
          topWeaknesses: analysis.topWeaknesses,
          subjects: analysis.subjectStats,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        showToast('error', body.error || 'Could not generate your exam-technique report.');
        return;
      }
      setReport(body as CoachResult);
    } catch (err) {
      console.error('Exam coach generation failed', err);
      showToast('error', 'Could not generate your exam-technique report due to a network error.');
    } finally {
      setIsGenerating(false);
    }
  };

  const hasEnoughData = attempts.length > 0;

  return (
    <main className="space-y-6" aria-labelledby="exam-coach-title">
      <RevisionCycleStepper current="improve" />

      <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Exam technique</p>
            <div className="mt-2 flex items-center gap-3">
              <Compass className="h-7 w-7 text-accent" />
              <h1 id="exam-coach-title" className="text-3xl font-bold text-content dark:text-white">Exam Coach</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-content-muted">
              Patterns in why you keep losing marks, drawn from every Smart Practice attempt you&apos;ve marked so far.
            </p>
          </div>
          <Link href="/dashboard/ai-questions/stats" className={buttonStyles({ variant: 'secondary' })}>
            Practice stats
          </Link>
        </div>
      </section>

      {isLoading ? (
        <p className="text-sm text-content-subtle">Loading your practice history…</p>
      ) : !hasEnoughData ? (
        <section className="rounded-2xl border border-dashed border-subtle bg-surface-sunken p-6 text-sm text-content-muted dark:bg-surface/3">
          Mark at least one Smart Practice attempt first — the coach needs real performance data to work from.
          <div className="mt-4">
            <Link href="/dashboard/ai-questions" className={buttonStyles({ variant: 'primary' })}>Go to Smart Practice</Link>
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-card">
            <h2 className="text-lg font-bold text-content">Band distribution</h2>
            <p className="mt-1 text-sm text-content-muted">Across {analysis.totalQuestions} marked questions from your last {attempts.length} attempts.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {analysis.bandDistribution.length === 0 ? (
                <p className="text-sm text-content-subtle">No per-question band data yet.</p>
              ) : (
                analysis.bandDistribution.map(({ band, count }) => (
                  <span key={band} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${BAND_COLORS[band] || 'bg-slate-100 text-content-muted dark:bg-surface/10'}`}>
                    {band}: {count}
                  </span>
                ))
              )}
            </div>

            {analysis.subjectStats.length > 0 ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {analysis.subjectStats.map((s) => (
                  <div key={s.subject} className="rounded-xl border border-subtle p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-content">{getSubjectLabel(s.subject)}</p>
                      {s.trend === 'improving' ? (
                        <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : s.trend === 'declining' ? (
                        <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-content-muted">{s.avgPercentage}% avg · {s.attempts} attempt{s.attempts === 1 ? '' : 's'}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-content">Your report</h2>
              <button className={buttonStyles({ variant: 'primary' })} onClick={handleGenerate} disabled={isGenerating}>
                <Sparkles className="h-4 w-4" />
                {isGenerating ? 'Analysing...' : report ? 'Regenerate report' : 'Generate my exam-technique report'}
              </button>
            </div>

            {report ? (
              <div className="mt-5 space-y-5">
                <p className="text-base font-semibold text-content">{report.headline}</p>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-content-subtle">Why you&apos;re losing marks</h3>
                  <ul className="mt-2 space-y-2">
                    {report.patterns.map((pattern, index) => (
                      <li key={index} className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/20 dark:text-amber-200">
                        {pattern}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-content-subtle">Do this next</h3>
                  <ul className="mt-2 space-y-2">
                    {report.nextSteps.map((step, index) => (
                      <li key={index} className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900 dark:border-emerald-700/40 dark:bg-emerald-950/20 dark:text-emerald-200">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-content-muted">
                Generate a report to see the recurring, mark-scheme-language patterns behind your lost marks and what to do about them this week.
              </p>
            )}
          </section>

          {analysis.topWeaknesses.length > 0 ? (
            <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-card">
              <h2 className="text-lg font-bold text-content">Recurring weak areas</h2>
              <div className="mt-4 space-y-2">
                {analysis.topWeaknesses.map((w) => (
                  <div key={w.tag} className="flex items-center justify-between gap-3 rounded-lg border border-subtle px-3 py-2">
                    <span className="text-sm text-content-muted dark:text-slate-200">{w.tag}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-content-muted dark:bg-surface/10">
                        seen {w.count}×
                      </span>
                      <Link
                        href={`/dashboard/ai-questions?topic=${encodeURIComponent(w.tag)}`}
                        className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                      >
                        Retest this
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
