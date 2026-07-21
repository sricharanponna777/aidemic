'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Flame, Sparkles, Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { PageLoader } from '@/components/PageLoader';
import { calculateRetentionRate, calculateStudyStreak } from '@/lib/spacedRepetition';
import { weightedPredictedGrade } from '@/lib/ai/gradeAverages';
import { getSubjectLabel } from '@/lib/ai/subjectConfig';
import { gradeBadgeTone } from '@/lib/gradeTone';
import { useLinkedChildren } from './ParentChildContext';

type AttemptRow = {
  subject: string;
  exam_type?: string | null;
  weakness_tags?: string[] | null;
  weakness_analysis?: string[] | null;
  predicted_grade?: string | null;
  total_marks_awarded?: number | null;
  total_available_marks?: number | null;
};

type SubjectGrade = {
  subject: string;
  examType: string | null;
  grade: string;
  attempts: number;
};

type ChildMetrics = {
  subjectGrades: SubjectGrade[];
  studyStreak: number;
  retentionRate: number;
  assignmentsCompleted: number;
  topWeaknesses: { tag: string; count: number }[];
};

const emptyMetrics: ChildMetrics = {
  subjectGrades: [],
  studyStreak: 0,
  retentionRate: 0,
  assignmentsCompleted: 0,
  topWeaknesses: [],
};

const normalizeInsightLabel = (value: string) =>
  value
    .replace(/^Main pattern to fix:\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim()
    .slice(0, 70);

export default function ParentOverviewPage() {
  const supabase = createClient();
  const { selectedStudentId } = useLinkedChildren();

  const [metrics, setMetrics] = useState<ChildMetrics>(emptyMetrics);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    if (!selectedStudentId) return;

    let cancelled = false;
    const load = async () => {
      setMetricsLoading(true);
      const [attemptsResponse, sessionsResponse, cardsResponse, attemptStatusResponse] = await Promise.all([
        supabase
          .from('exam_practice_attempts')
          .select('subject, exam_type, weakness_tags, weakness_analysis, predicted_grade, total_marks_awarded, total_available_marks')
          .eq('user_id', selectedStudentId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('study_sessions').select('started_at').eq('user_id', selectedStudentId),
        supabase.from('flashcard_decks').select('id').eq('user_id', selectedStudentId),
        supabase.from('assignment_attempts').select('status').eq('student_id', selectedStudentId),
      ]);

      if (cancelled) return;

      const attempts = (attemptsResponse.data ?? []) as AttemptRow[];
      const deckIds = ((cardsResponse.data ?? []) as Array<{ id: string }>).map((d) => d.id);
      const cardsRows =
        deckIds.length > 0
          ? await supabase.from('flashcards').select('repetition_count, consecutive_correct').in('deck_id', deckIds)
          : { data: [] };

      const subjectGroups = new Map<string, AttemptRow[]>();
      for (const attempt of attempts) {
        const key = `${attempt.subject}|${attempt.exam_type ?? 'unknown'}`;
        subjectGroups.set(key, [...(subjectGroups.get(key) ?? []), attempt]);
      }
      const subjectGrades: SubjectGrade[] = [...subjectGroups.entries()]
        .map(([key, group]) => {
          const [subject, examType] = key.split('|');
          const prediction = weightedPredictedGrade(group, examType === 'unknown' ? null : examType);
          return { subject, examType: examType === 'unknown' ? null : examType, grade: prediction.grade, attempts: group.length };
        })
        .filter((item) => item.grade !== 'N/A')
        .sort((a, b) => a.subject.localeCompare(b.subject));

      const tagMap = new Map<string, number>();
      for (const attempt of attempts) {
        const rawInsights = (attempt.weakness_tags?.length ? attempt.weakness_tags : attempt.weakness_analysis) ?? [];
        for (const tag of rawInsights) {
          const norm = normalizeInsightLabel(tag);
          if (!norm) continue;
          tagMap.set(norm, (tagMap.get(norm) ?? 0) + 1);
        }
      }
      const topWeaknesses = [...tagMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, count]) => ({ tag, count }));

      const sessionDates = ((sessionsResponse.data ?? []) as Array<{ started_at: string | null }>)
        .map((s) => (s.started_at ? new Date(s.started_at).getTime() : NaN))
        .filter((t) => Number.isFinite(t));
      const studyStreak = calculateStudyStreak(sessionDates);

      const retentionRate = calculateRetentionRate(
        (cardsRows.data ?? []) as Array<{ repetition_count: number; consecutive_correct: number }>
      );

      const assignmentsCompleted = ((attemptStatusResponse.data ?? []) as Array<{ status: string }>).filter(
        (a) => a.status === 'completed'
      ).length;

      setMetrics({ subjectGrades, studyStreak, retentionRate, assignmentsCompleted, topWeaknesses });
      setMetricsLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedStudentId, supabase]);

  if (metricsLoading) {
    return <PageLoader text="Loading progress..." />;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Flame className="h-3.5 w-3.5 text-orange-500" />
            Study streak
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{metrics.studyStreak}d</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            Retention rate
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{Math.round(metrics.retentionRate)}%</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" />
            Assignments completed
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{metrics.assignmentsCompleted}</p>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2.5">
          <Trophy className="h-5 w-5 text-emerald-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Predicted grades</h2>
        </div>
        {metrics.subjectGrades.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
            No exam practice completed yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
            <div className="divide-y divide-slate-100 dark:divide-white/6">
              {metrics.subjectGrades.map((item) => (
                <div key={`${item.subject}-${item.examType ?? 'na'}`} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{getSubjectLabel(item.subject)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.attempts} attempts analysed</p>
                  </div>
                  <span
                    className={`inline-flex min-w-14 justify-center rounded-lg px-3 py-1.5 text-sm font-black ${gradeBadgeTone({
                      grade: item.grade,
                      examType: item.examType,
                    })}`}
                  >
                    {item.grade}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2.5">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Recurring weak areas</h2>
        </div>
        {metrics.topWeaknesses.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
            No recurring weaknesses detected yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {metrics.topWeaknesses.map((weakness) => (
              <span
                key={weakness.tag}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
              >
                {weakness.tag} · {weakness.count}×
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
