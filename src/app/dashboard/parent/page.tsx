'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Flame, Sparkles, Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { PageLoader } from '@/components/PageLoader';
import { calculateRetentionRate, calculateStudyStreak } from '@/lib/spacedRepetition';
import { weightedPredictedGrade } from '@/lib/ai/gradeAverages';
import { describeMasteryCoverage, masteryCoverage } from '@/lib/ai/gradeFromMastery';
import { readSpecificationSubtopicCounts, readStudentMastery } from '@/lib/mastery/read';
import { mapStudentSubjectRow, STUDENT_SUBJECT_SELECT, type StudentSubjectRow } from '@/lib/ai/studentSubjects';
import { getSubjectLabel } from '@/lib/ai/subjectConfig';
import { gradeBadgeTone } from '@/lib/gradeTone';
import { rankWeaknesses, trendLabel, type RankedWeakness } from '@/lib/weaknesses';
import { useLinkedChildren } from './ParentChildContext';

type AttemptRow = {
  subject: string;
  created_at?: string | null;
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
  /** How much of the specification the grade rests on, when the spine knows. */
  coverageLabel: string | null;
};

type ChildMetrics = {
  subjectGrades: SubjectGrade[];
  studyStreak: number;
  retentionRate: number;
  assignmentsCompleted: number;
  topWeaknesses: RankedWeakness[];
};

const emptyMetrics: ChildMetrics = {
  subjectGrades: [],
  studyStreak: 0,
  retentionRate: 0,
  assignmentsCompleted: 0,
  topWeaknesses: [],
};

export default function ParentOverviewPage() {
  const supabase = createClient();
  const { selectedStudentId } = useLinkedChildren();

  const [metrics, setMetrics] = useState<ChildMetrics>(emptyMetrics);
  // Starts true: initialising to false paints "0d streak / nothing completed"
  // before the first fetch lands, telling parents their child has done nothing.
  const [metricsLoading, setMetricsLoading] = useState(true);

  useEffect(() => {
    if (!selectedStudentId) return;

    let cancelled = false;
    const load = async () => {
      setMetricsLoading(true);
      const [attemptsResponse, sessionsResponse, cardsResponse, attemptStatusResponse, subjectsResponse, masteryRows] =
        await Promise.all([
          supabase
            .from('exam_practice_attempts')
            .select('subject, created_at, exam_type, weakness_tags, weakness_analysis, predicted_grade, total_marks_awarded, total_available_marks')
            .eq('user_id', selectedStudentId)
            .order('created_at', { ascending: false })
            .limit(50),
          supabase.from('study_sessions').select('started_at').eq('user_id', selectedStudentId),
          supabase.from('flashcard_decks').select('id').eq('user_id', selectedStudentId),
          supabase.from('assignment_attempts').select('status').eq('student_id', selectedStudentId),
          supabase
            .from('student_subjects')
            .select(`specification_id, ${STUDENT_SUBJECT_SELECT}`)
            .eq('user_id', selectedStudentId),
          // Reads through the existing is_parent_of_student SELECT policies on
          // the spine tables -- no new policy, and still read-only.
          readStudentMastery(supabase, selectedStudentId, { limit: 2000 }),
        ]);

      if (cancelled) return;

      const subjectRows = (subjectsResponse.data ?? []) as unknown as (StudentSubjectRow & {
        specification_id: string | null;
      })[];
      const specificationBySubject = new Map<string, string>();
      for (const row of subjectRows) {
        const { subject } = mapStudentSubjectRow(row);
        if (row.specification_id) specificationBySubject.set(subject, row.specification_id);
      }
      const subtopicCounts = await readSpecificationSubtopicCounts(supabase, [
        ...specificationBySubject.values(),
      ]);
      if (cancelled) return;

      const attempts = (attemptsResponse.data ?? []) as AttemptRow[];
      const deckIds = ((cardsResponse.data ?? []) as Array<{ id: string }>).map((d) => d.id);
      const cardsRows =
        deckIds.length > 0
          ? await supabase.from('flashcards').select('times_studied, times_correct').in('deck_id', deckIds)
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
          const specificationId = specificationBySubject.get(subject);
          const coverage = specificationId
            ? masteryCoverage(
                masteryRows.filter((row) => row.scope.subject === subject),
                subtopicCounts.get(specificationId) ?? 0
              )
            : null;
          return {
            subject,
            examType: examType === 'unknown' ? null : examType,
            grade: prediction.grade,
            attempts: group.length,
            coverageLabel: coverage ? describeMasteryCoverage(coverage) : null,
          };
        })
        .filter((item) => item.grade !== 'N/A')
        .sort((a, b) => a.subject.localeCompare(b.subject));

      const topWeaknesses = rankWeaknesses(
        attempts.map((attempt) => ({
          createdAt: attempt.created_at ?? null,
          subject: attempt.subject,
          tags: (attempt.weakness_tags?.length ? attempt.weakness_tags : attempt.weakness_analysis) ?? [],
        })),
        { limit: 5 }
      );

      const sessionDates = ((sessionsResponse.data ?? []) as Array<{ started_at: string | null }>)
        .map((s) => (s.started_at ? new Date(s.started_at).getTime() : NaN))
        .filter((t) => Number.isFinite(t));
      const studyStreak = calculateStudyStreak(sessionDates);

      const retentionRate = calculateRetentionRate(
        (cardsRows.data ?? []) as Array<{ times_studied: number; times_correct: number }>
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

  if (!selectedStudentId) return null;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-content-subtle">
            <Flame className="h-3.5 w-3.5 text-orange-500" />
            Study streak
          </div>
          <p className="mt-2 text-2xl font-bold text-content dark:text-white">{metrics.studyStreak}d</p>
        </div>
        <div className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-content-subtle">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            Retention rate
          </div>
          <p className="mt-2 text-2xl font-bold text-content dark:text-white">{Math.round(metrics.retentionRate)}%</p>
        </div>
        <div className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-content-subtle">
            <ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" />
            Assignments completed
          </div>
          <p className="mt-2 text-2xl font-bold text-content dark:text-white">{metrics.assignmentsCompleted}</p>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2.5">
          <Trophy className="h-5 w-5 text-emerald-500" />
          <h2 className="text-lg font-bold text-content dark:text-white">Predicted grades</h2>
        </div>
        {metrics.subjectGrades.length === 0 ? (
          <p className="rounded-lg border border-dashed border-subtle bg-surface-sunken p-5 text-sm text-content-subtle dark:border-white/6 dark:bg-surface/3">
            No exam practice completed yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-subtle bg-surface shadow-sm">
            <div className="divide-y divide-slate-100 dark:divide-white/6">
              {metrics.subjectGrades.map((item) => (
                <div key={`${item.subject}-${item.examType ?? 'na'}`} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-semibold text-content dark:text-white">{getSubjectLabel(item.subject)}</p>
                    <p className="text-xs text-content-subtle">{item.attempts} attempts analysed</p>
                    {item.coverageLabel ? (
                      <p className="text-xs text-content-subtle">{item.coverageLabel}</p>
                    ) : null}
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
          <h2 className="text-lg font-bold text-content dark:text-white">Recurring weak areas</h2>
        </div>
        {metrics.topWeaknesses.length === 0 ? (
          <p className="rounded-lg border border-dashed border-subtle bg-surface-sunken p-5 text-sm text-content-subtle dark:border-white/6 dark:bg-surface/3">
            No recurring weaknesses detected yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {metrics.topWeaknesses.map((weakness) => (
              <span
                key={weakness.tag}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
              >
                {weakness.tag} · {weakness.count}× · {trendLabel(weakness.trend)}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
