'use client';

import { useEffect, useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { PageLoader } from '@/components/PageLoader';
import { weightedPredictedGrade } from '@/lib/ai/gradeAverages';
import { getSubjectLabel } from '@/lib/ai/subjectConfig';
import { gradeBadgeTone } from '@/lib/gradeTone';
import { useLinkedChildren } from '../ParentChildContext';

type AttemptRow = {
  subject: string;
  exam_type?: string | null;
  percentage?: number | null;
  predicted_grade?: string | null;
  total_marks_awarded?: number | null;
  total_available_marks?: number | null;
  created_at?: string | null;
};

type SubjectTrend = {
  key: string;
  subject: string;
  examType: string | null;
  grade: string;
  latestPercentage: number | null;
  delta: number | null;
  series: number[];
};

function Sparkline({ values }: { values: number[] }) {
  const width = 200;
  const height = 48;
  if (values.length < 2) {
    return (
      <div className="flex h-12 items-center text-xs text-slate-400 dark:text-slate-500">
        Not enough attempts to chart a trend yet.
      </div>
    );
  }
  const max = Math.max(...values, 100);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-full" preserveAspectRatio="none">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-indigo-500 dark:text-indigo-400"
      />
    </svg>
  );
}

export default function ParentProgressPage() {
  const supabase = createClient();
  const { selectedStudentId } = useLinkedChildren();

  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedStudentId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('exam_practice_attempts')
        .select('subject, exam_type, percentage, predicted_grade, total_marks_awarded, total_available_marks, created_at')
        .eq('user_id', selectedStudentId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (cancelled) return;
      setAttempts((data ?? []) as AttemptRow[]);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedStudentId, supabase]);

  const trends = useMemo<SubjectTrend[]>(() => {
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
        const series = group
          .map((a) => (typeof a.percentage === 'number' ? a.percentage : null))
          .filter((v): v is number => v !== null);
        const latestPercentage = series.length > 0 ? series[series.length - 1] : null;
        const delta = series.length >= 2 ? Math.round(series[series.length - 1] - series[0]) : null;
        return { key, subject, examType: normalizedExamType, grade: prediction.grade, latestPercentage, delta, series };
      })
      .filter((item) => item.grade !== 'N/A' || item.series.length > 0)
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }, [attempts]);

  if (loading) {
    return <PageLoader text="Loading progress trends..." />;
  }

  if (!selectedStudentId) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <TrendingUp className="h-5 w-5 text-indigo-500" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Progress over time</h2>
      </div>

      {trends.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
          No exam practice completed yet. Trends will appear here once your child starts practising.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {trends.map((item) => (
            <div
              key={item.key}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{getSubjectLabel(item.subject)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {item.series.length} scored {item.series.length === 1 ? 'attempt' : 'attempts'}
                  </p>
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

              <div className="mt-4">
                <Sparkline values={item.series} />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  Latest: {item.latestPercentage !== null ? `${Math.round(item.latestPercentage)}%` : '—'}
                </span>
                {item.delta !== null ? (
                  <span
                    className={`font-semibold ${
                      item.delta > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : item.delta < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {item.delta > 0 ? '▲' : item.delta < 0 ? '▼' : '■'} {Math.abs(item.delta)}% since first
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
