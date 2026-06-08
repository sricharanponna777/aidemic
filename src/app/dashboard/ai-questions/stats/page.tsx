'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Target, Trophy } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { getExamTypeLabel, getSubjectLabel } from '@/lib/ai/subjectConfig';
import { weightedPredictedGrade } from '@/lib/ai/gradeAverages';

type AttemptRow = {
  id: string;
  subject: string;
  exam_board: string;
  exam_type: string;
  topic: string;
  total_marks_awarded: number | null;
  total_available_marks: number | null;
  percentage: number | null;
  predicted_grade: string | null;
  weakness_tags: string[] | null;
  weakness_analysis: string[] | null;
  created_at: string | null;
};

type SubjectRow = {
  id: string;
  subject: string;
  exam_type: string | null;
};

const formatDate = (value: string | null) => {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

const cleanWeakness = (value: string) =>
  value
    .replace(/^Main pattern to fix:\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim();

export default function SmartPracticeStatsPage() {
  const { session } = useAuth();
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!session?.user?.id) return;

    const loadAttempts = async () => {
      setIsLoading(true);
      setErrorMessage('');
      const supabase = createClient();
      const [attemptsResponse, subjectsResponse] = await Promise.all([
        supabase
          .from('exam_practice_attempts')
          .select('id, subject, exam_board, exam_type, topic, total_marks_awarded, total_available_marks, percentage, predicted_grade, weakness_tags, weakness_analysis, created_at')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_subjects')
          .select('id, subject, exam_type')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: true }),
      ]);

      if (attemptsResponse.error) {
        console.error('Failed to load practice statistics', attemptsResponse.error);
        setErrorMessage('Could not load Smart Practice statistics.');
        setAttempts([]);
      } else {
        setAttempts((attemptsResponse.data as AttemptRow[]) ?? []);
      }
      if (subjectsResponse.error) {
        console.error('Failed to load saved subjects for practice statistics', subjectsResponse.error);
        setSubjects([]);
      } else {
        setSubjects((subjectsResponse.data as SubjectRow[]) ?? []);
      }
      setIsLoading(false);
    };

    void loadAttempts();
  }, [session?.user?.id]);

  const stats = useMemo(() => {
    const weaknessMap = new Map<string, number>();
    const subjectMap = new Map<string, AttemptRow[]>();
    for (const attempt of attempts) {
      const key = `${attempt.subject}|${attempt.exam_type}`;
      subjectMap.set(key, [...(subjectMap.get(key) ?? []), attempt]);

      const raw = attempt.weakness_tags?.length ? attempt.weakness_tags : attempt.weakness_analysis ?? [];
      for (const item of raw) {
        const label = cleanWeakness(item);
        if (!label) continue;
        weaknessMap.set(label, (weaknessMap.get(label) ?? 0) + 1);
      }
    }
    const subjectKeys = new Map<string, SubjectRow>();
    for (const group of subjectMap.values()) {
      const first = group[0];
      const key = `${first.subject}|${first.exam_type ?? 'unknown'}`;
      const savedSubject = subjects.find((subject) => subject.subject === first.subject && subject.exam_type === first.exam_type);
      subjectKeys.set(key, { id: savedSubject?.id ?? key, subject: first.subject, exam_type: first.exam_type });
    }

    return {
      subjectPredictions: [...subjectKeys.values()]
        .map((subject) => {
          const group = subjectMap.get(`${subject.subject}|${subject.exam_type ?? 'unknown'}`) ?? [];
          const average = weightedPredictedGrade(group, subject.exam_type);
          return {
            subject: subject.subject,
            examType: subject.exam_type,
            grade: average.grade,
            attempts: group.length,
            analysableAttempts: average.analysableCount,
          };
        })
        .filter((item) => item.analysableAttempts > 0)
        .sort((a, b) => a.subject.localeCompare(b.subject) || (a.examType ?? '').localeCompare(b.examType ?? '')),
      weaknesses: [...weaknessMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12),
    };
  }, [attempts, subjects]);

  return (
    <main className="space-y-7" aria-labelledby="practice-stats-title">
      <section className="rounded-2xl border border-slate-200 bg-linear-to-br from-indigo-50 to-white p-6 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.7)] dark:border-white/6 dark:from-[#131B2E] dark:to-[#0d1424]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">Smart Practice</p>
            <div className="mt-2 flex items-center gap-3">
              <BarChart3 className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
              <h1 id="practice-stats-title" className="text-3xl font-bold text-slate-900 dark:text-white">Statistics</h1>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Review all marked practice attempts, grades, scores, and recurring weak areas.
            </p>
          </div>
          <Link href="/dashboard" className={buttonStyles({ variant: 'secondary' })}>
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </div>
      </section>

      {errorMessage ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700/60 dark:bg-red-950/35 dark:text-red-200">
          {errorMessage}
        </p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-[0.55fr_1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <Target className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{isLoading ? '...' : attempts.length}</p>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Exam Practice Attempts</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <Trophy className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="mt-3 font-semibold text-slate-900 dark:text-white">Predicted Grades</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {isLoading ? (
              [1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-white/5" />)
            ) : stats.subjectPredictions.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Complete exam practice to build your report card.</p>
            ) : (
              stats.subjectPredictions.map((item) => (
                <div key={`${item.subject}-${item.examType}`} className="rounded-lg border border-slate-100 px-3 py-2 dark:border-white/6">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {getSubjectLabel(item.subject)}: {item.grade}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {item.examType ? getExamTypeLabel(item.examType) : 'Qualification pending'} - {item.analysableAttempts === 0 ? 'no analysable grades' : `${item.analysableAttempts}/${item.attempts} attempts`}
                  </p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_0.55fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-white/6">
            <h2 className="font-semibold text-slate-900 dark:text-white">All Attempts</h2>
          </div>
          {isLoading ? (
            <div className="space-y-px p-4">
              {[1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
              ))}
            </div>
          ) : attempts.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No marked attempts yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/6">
              {attempts.map((attempt) => (
                <Link
                  key={attempt.id}
                  href={`/dashboard/ai-questions/stats/${attempt.id}`}
                  className="grid gap-3 px-5 py-4 transition hover:bg-indigo-50/50 dark:hover:bg-indigo-500/8 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{attempt.topic}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {getSubjectLabel(attempt.subject)} - {attempt.exam_board.toUpperCase()} {getExamTypeLabel(attempt.exam_type)} - {formatDate(attempt.created_at)}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{attempt.percentage ?? '--'}%</span>
                  <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                    {attempt.predicted_grade || 'N/A'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {attempt.total_marks_awarded ?? '--'} / {attempt.total_available_marks ?? '--'} marks
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <h2 className="font-semibold text-slate-900 dark:text-white">Recurring Weak Areas</h2>
          <div className="mt-4 space-y-2">
            {isLoading ? (
              [1, 2, 3].map((item) => <div key={item} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-white/5" />)
            ) : stats.weaknesses.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No weak areas recorded yet.</p>
            ) : (
              stats.weaknesses.map(([label, count]) => (
                <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 dark:border-white/6">
                  <span className="min-w-0 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-500/20 dark:text-red-300">
                    {count}
                  </span>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
