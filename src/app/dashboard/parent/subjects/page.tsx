'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BookOpen, Minus } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { PageLoader } from '@/components/PageLoader';
import { weightedPredictedGrade } from '@/lib/ai/gradeAverages';
import { getSubjectLabel } from '@/lib/ai/subjectConfig';
import { gradeBadgeTone } from '@/lib/gradeTone';
import { STUDENT_SUBJECT_SELECT, mapStudentSubjectRow, type StudentSubjectRow } from '@/lib/ai/studentSubjects';
import { useLinkedChildren } from '../ParentChildContext';

type AttemptRow = {
  subject: string;
  exam_type?: string | null;
  percentage?: number | null;
  predicted_grade?: string | null;
  weakness_tags?: string[] | null;
  weakness_analysis?: string[] | null;
  total_marks_awarded?: number | null;
  total_available_marks?: number | null;
  created_at?: string | null;
};

type SubjectCard = {
  key: string;
  subject: string;
  examType: string | null;
  grade: string;
  attempts: number;
  avgPercentage: number | null;
  trend: 'improving' | 'declining' | 'steady';
  weakAreas: { tag: string; count: number }[];
};

const RECENT_WINDOW = 3;

const normalizeInsightLabel = (value: string) =>
  value
    .replace(/^Main pattern to fix:\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim()
    .slice(0, 70);

export default function ParentSubjectsPage() {
  const supabase = createClient();
  const { selectedStudentId } = useLinkedChildren();

  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [enrolledSubjects, setEnrolledSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedStudentId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [attemptsResponse, subjectsResponse] = await Promise.all([
        supabase
          .from('exam_practice_attempts')
          .select('subject, exam_type, percentage, predicted_grade, weakness_tags, weakness_analysis, total_marks_awarded, total_available_marks, created_at')
          .eq('user_id', selectedStudentId)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('student_subjects').select(STUDENT_SUBJECT_SELECT).eq('user_id', selectedStudentId),
      ]);
      if (cancelled) return;
      setAttempts((attemptsResponse.data ?? []) as AttemptRow[]);
      setEnrolledSubjects(
        ((subjectsResponse.data ?? []) as StudentSubjectRow[]).map((row) => mapStudentSubjectRow(row).subject).filter(Boolean)
      );
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedStudentId, supabase]);

  const cards = useMemo<SubjectCard[]>(() => {
    const groups = new Map<string, AttemptRow[]>();
    for (const attempt of attempts) {
      const key = `${attempt.subject}|${attempt.exam_type ?? 'unknown'}`;
      groups.set(key, [...(groups.get(key) ?? []), attempt]);
    }
    return [...groups.entries()]
      .map(([key, group]) => {
        const [subject, examType] = key.split('|');
        const normalizedExamType = examType === 'unknown' ? null : examType;
        const prediction = weightedPredictedGrade(group, normalizedExamType);

        // group is newest-first (query ordered descending).
        const withPct = group.filter((a) => typeof a.percentage === 'number') as Array<{ percentage: number }>;
        const avgPercentage =
          withPct.length > 0 ? Math.round(withPct.reduce((sum, a) => sum + a.percentage, 0) / withPct.length) : null;
        const recent = withPct.slice(0, RECENT_WINDOW);
        const earlier = withPct.slice(RECENT_WINDOW, RECENT_WINDOW * 2);
        const recentAvg = recent.length > 0 ? recent.reduce((s, a) => s + a.percentage, 0) / recent.length : null;
        const earlierAvg = earlier.length > 0 ? earlier.reduce((s, a) => s + a.percentage, 0) / earlier.length : null;
        const trend: SubjectCard['trend'] =
          recentAvg !== null && earlierAvg !== null && recentAvg - earlierAvg >= 5
            ? 'improving'
            : recentAvg !== null && earlierAvg !== null && earlierAvg - recentAvg >= 5
              ? 'declining'
              : 'steady';

        const tagMap = new Map<string, number>();
        for (const attempt of group) {
          const raw = (attempt.weakness_tags?.length ? attempt.weakness_tags : attempt.weakness_analysis) ?? [];
          for (const tag of raw) {
            const norm = normalizeInsightLabel(tag);
            if (!norm) continue;
            tagMap.set(norm, (tagMap.get(norm) ?? 0) + 1);
          }
        }
        const weakAreas = [...tagMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([tag, count]) => ({ tag, count }));

        return { key, subject, examType: normalizedExamType, grade: prediction.grade, attempts: group.length, avgPercentage, trend, weakAreas };
      })
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }, [attempts]);

  const practisedSubjects = useMemo(() => new Set(cards.map((c) => c.subject)), [cards]);
  const notStarted = useMemo(
    () => [...new Set(enrolledSubjects)].filter((s) => !practisedSubjects.has(s)),
    [enrolledSubjects, practisedSubjects]
  );

  if (loading) {
    return <PageLoader text="Loading subjects..." />;
  }

  if (!selectedStudentId) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <BookOpen className="h-5 w-5 text-indigo-500" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Subjects</h2>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
          No exam practice completed yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <div
              key={card.key}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{getSubjectLabel(card.subject)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{card.attempts} attempts analysed</p>
                </div>
                <span
                  className={`inline-flex min-w-14 justify-center rounded-lg px-3 py-1.5 text-sm font-black ${gradeBadgeTone({
                    grade: card.grade,
                    examType: card.examType,
                  })}`}
                >
                  {card.grade}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Avg score</p>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {card.avgPercentage !== null ? `${card.avgPercentage}%` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Trend</p>
                  <p
                    className={`flex items-center gap-1 font-semibold ${
                      card.trend === 'improving'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : card.trend === 'declining'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {card.trend === 'improving' ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : card.trend === 'declining' ? (
                      <ArrowDownRight className="h-4 w-4" />
                    ) : (
                      <Minus className="h-4 w-4" />
                    )}
                    {card.trend.charAt(0).toUpperCase() + card.trend.slice(1)}
                  </p>
                </div>
              </div>

              {card.weakAreas.length > 0 ? (
                <div className="mt-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Weak areas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {card.weakAreas.map((w) => (
                      <span
                        key={w.tag}
                        className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
                      >
                        {w.tag} · {w.count}×
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {notStarted.length > 0 ? (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Enrolled, no practice yet</p>
          <div className="flex flex-wrap gap-1.5">
            {notStarted.map((subject) => (
              <span
                key={subject}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
              >
                {getSubjectLabel(subject)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
