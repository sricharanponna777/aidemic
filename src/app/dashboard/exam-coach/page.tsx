'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Compass, Radar, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/feedback';
import { Chip, MonoLabel, Panel, PanelHeading, Stat, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ToastProvider';
import { cachedAiFetch } from '@/lib/aiCache';
import { createClient } from '@/lib/supabase-client';
import { getSubjectLabel } from '@/lib/ai/subjectConfig';
import { rankWeaknesses, trendLabel } from '@/lib/weaknesses';

const ATTEMPT_LOOKBACK = 40;
const RECENT_WINDOW = 5;

const BAND_ORDER = ['No credit yet', 'Limited', 'Developing', 'Secure', 'Top band'];
const BAND_COLORS: Record<string, string> = {
  'No credit yet': 'bg-danger-muted text-danger',
  Limited: 'bg-warning-muted text-warning',
  Developing: 'bg-info-muted text-info',
  Secure: 'bg-success-muted text-success',
  'Top band': 'bg-xp-muted text-xp',
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
  attempt_mode: string | null;
};

type CoachResult = { headline: string; patterns: string[]; nextSteps: string[] };

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
          .select('id, subject, percentage, weakness_tags, weakness_analysis, marking_report, created_at, attempt_mode')
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
    const subjectGroups = new Map<string, AttemptRow[]>();
    let totalQuestions = 0;

    for (const attempt of attempts) {
      subjectGroups.set(attempt.subject, [...(subjectGroups.get(attempt.subject) ?? []), attempt]);

      const markedAnswers = attempt.marking_report?.markedAnswers ?? [];
      for (const answer of markedAnswers) {
        totalQuestions += 1;
        if (answer.band) bandCounts.set(answer.band, (bandCounts.get(answer.band) || 0) + 1);
      }
    }

    const bandDistribution = BAND_ORDER
      .map((band) => ({ band, count: bandCounts.get(band) || 0 }))
      .filter((entry) => entry.count > 0);

    // Recency-weighted, so coaching targets what is still going wrong rather
    // than whatever was most common across the student's whole history.
    const topWeaknesses = rankWeaknesses(
      attempts.map((attempt) => ({
        createdAt: attempt.created_at,
        subject: attempt.subject,
        tags: (attempt.weakness_tags?.length ? attempt.weakness_tags : attempt.weakness_analysis) ?? [],
      })),
      { limit: 8 }
    );

    const subjectStats = [...subjectGroups.entries()].map(([subject, group]) => {
      const sorted = [...group].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      // Blurting records a free-recall coverage %, not a mark-scheme score, so
      // averaging it in here would read as a practice result it is not.
      const withPct = sorted.filter((a) => a.attempt_mode !== 'blurt' && typeof a.percentage === 'number');
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
      const response = await cachedAiFetch('/api/ai/exam-coach', {
        totalAttempts: attempts.length,
        totalQuestionsAnalyzed: analysis.totalQuestions,
        bandDistribution: analysis.bandDistribution,
        topWeaknesses: analysis.topWeaknesses,
        subjects: analysis.subjectStats,
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

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Practice data</PanelHeading>
      {hasEnoughData ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Attempts" value={attempts.length} />
            <Stat label="Questions" value={analysis.totalQuestions} />
          </div>

          <Panel>
            <PanelHeading as="h3">Band distribution</PanelHeading>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {analysis.bandDistribution.length === 0 ? (
                <p className="text-[13px] text-content-subtle">No per-question band data yet.</p>
              ) : (
                analysis.bandDistribution.map(({ band, count }) => (
                  <span
                    key={band}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${BAND_COLORS[band] || 'bg-surface-sunken text-content-muted'}`}
                  >
                    {band}: {count}
                  </span>
                ))
              )}
            </div>
          </Panel>

          {analysis.subjectStats.length > 0 ? (
            <Panel className="p-0">
              <div className="border-b border-subtle px-4 py-3">
                <PanelHeading as="h3">By subject</PanelHeading>
              </div>
              <ul className="divide-y divide-subtle">
                {analysis.subjectStats.map((s) => (
                  <li key={s.subject} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-content">{getSubjectLabel(s.subject)}</p>
                      <p className="font-mono text-[11px] text-content-subtle">
                        {s.attempts} attempt{s.attempts === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 font-mono text-sm font-semibold text-content">
                      {s.avgPercentage}%
                      {s.trend === 'improving' ? (
                        <TrendingUp className="h-4 w-4 text-success" aria-label="Improving" />
                      ) : s.trend === 'declining' ? (
                        <TrendingDown className="h-4 w-4 text-danger" aria-label="Declining" />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </>
      ) : (
        <Panel>
          <p className="text-sm font-semibold text-content">Nothing to analyse yet</p>
          <p className="mt-1 text-[13px] text-content-subtle">Your marked Smart Practice attempts appear here.</p>
        </Panel>
      )}
      <Link
        href="/dashboard/ai-questions/stats"
        className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'w-full justify-center' })}
      >
        Practice stats
      </Link>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={Compass}
        eyebrow="Improve / Exam technique"
        titleId="exam-coach-title"
        title="Exam Coach"
        description="Patterns in why you keep losing marks, drawn from every Smart Practice attempt you've marked so far."
        actions={
          <>
            <Chip>● Mode: technique report</Chip>
            {hasEnoughData ? (
              <Chip tone="success">
                Last {attempts.length} attempt{attempts.length === 1 ? '' : 's'}
              </Chip>
            ) : null}
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        {isLoading ? (
          <p className="p-5 text-sm text-content-subtle">Loading your practice history…</p>
        ) : !hasEnoughData ? (
          <div className="p-5">
            <div className="rounded-lg border border-dashed border-subtle bg-surface-sunken p-6 text-sm text-content-muted">
              Mark at least one Smart Practice attempt first — the coach needs real performance data to work from.
              <div className="mt-4">
                <Link href="/dashboard/ai-questions" className={buttonStyles({ variant: 'primary' })}>
                  Go to Smart Practice
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section className="flex-1 space-y-5 p-5">
              <PanelHeading icon={Sparkles}>Your report</PanelHeading>
              {report ? (
                <>
                  <div className="flex gap-3 rounded-lg border border-subtle bg-surface-sunken p-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-subtle bg-surface text-content-subtle">
                      <Compass className="h-4 w-4" />
                    </span>
                    <div>
                      <MonoLabel>Headline</MonoLabel>
                      <p className="mt-1 text-body font-semibold text-content">{report.headline}</p>
                    </div>
                  </div>

                  <div>
                    <MonoLabel className="text-warning">Why you&apos;re losing marks</MonoLabel>
                    <ul className="mt-2 space-y-2">
                      {report.patterns.map((pattern, index) => (
                        <li key={index} className="rounded-lg border border-warning/30 bg-warning-muted p-3 text-sm text-content">
                          {pattern}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <MonoLabel className="text-success">Do this next</MonoLabel>
                    <ul className="mt-2 space-y-2">
                      {report.nextSteps.map((step, index) => (
                        <li key={index} className="flex items-start gap-2 rounded-lg border border-success/30 bg-success-muted p-3 text-sm text-content">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <p className="text-sm text-content-muted">
                  Generate a report to see the recurring, mark-scheme-language patterns behind your lost marks and what to do about them this week.
                </p>
              )}

              {analysis.topWeaknesses.length > 0 ? (
                <div className="border-t border-subtle pt-5">
                  <PanelHeading className="mb-3">Recurring weak areas</PanelHeading>
                  <div className="space-y-2">
                    {analysis.topWeaknesses.map((w) => (
                      <div key={w.tag} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-subtle bg-surface px-3 py-2">
                        <span className="text-sm text-content">{w.tag}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <Chip>
                            seen {w.count}× · {trendLabel(w.trend)}
                          </Chip>
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
                </div>
              ) : null}
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle p-4">
              <p className="font-mono text-xs text-content-subtle max-sm:hidden">
                From {analysis.totalQuestions} marked questions
              </p>
              <button
                className={buttonStyles({ variant: 'primary', className: 'max-sm:w-full' })}
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                <Sparkles className="h-4 w-4" />
                {isGenerating ? 'Analysing...' : report ? 'Regenerate report' : 'Generate my exam-technique report'}
              </button>
            </div>
          </>
        )}
      </WorkspaceBody>
    </Workspace>
  );
}
