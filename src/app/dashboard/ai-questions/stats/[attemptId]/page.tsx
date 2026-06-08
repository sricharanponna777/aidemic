'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, BarChart3, CheckCircle2, Target, Trophy } from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { getExamTypeLabel, getSubjectLabel } from '@/lib/ai/subjectConfig';
import { gcseTierLabelForGrade } from '@/lib/gradeTone';

type ExamQuestion = {
  questionType?: 'open' | 'mcq';
  question?: string;
  marks?: number;
  commandWord?: string;
  options?: string[];
  correctOption?: string;
  markScheme?: string[];
  modelAnswer?: string;
  skillsAssessed?: string[];
};

type MarkedAnswer = {
  questionIndex: number;
  marksAwarded: number;
  maxMarks: number;
  band: string;
  feedback: string;
  strengths?: string[];
  improvements?: string[];
  weaknessTags?: string[];
  exemplarAnswer?: string;
};

type MarkingReport = {
  markedAnswers?: MarkedAnswer[];
  totalMarksAwarded?: number;
  totalAvailableMarks?: number;
  percentage?: number;
  predictedGrade?: string;
  targetGrade?: string | null;
  summary?: string;
  weaknessAnalysis?: string[];
  gradeBoostAdvice?: string[];
  gradeBoundaryNote?: string;
  sourceMaterial?: string;
};

type AttemptDetail = {
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
  questions_payload?: unknown;
  answers_payload?: unknown;
  marking_report?: unknown;
  created_at: string | null;
};

const formatDateTime = (value: string | null) => {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const formatTieredExamLabel = (examType: string, specTier?: string | null, grade?: string | null) =>
  [
    getExamTypeLabel(examType),
    gcseTierLabelForGrade({ grade, examType, specTier }) ?? '',
  ].filter(Boolean).join(' ');

const asQuestions = (value: unknown): ExamQuestion[] => Array.isArray(value) ? value as ExamQuestion[] : [];
const asAnswers = (value: unknown): string[] => Array.isArray(value) ? value.map((item) => String(item ?? '')) : [];
const asReport = (value: unknown): MarkingReport | null =>
  value && typeof value === 'object' ? value as MarkingReport : null;

const baseAttemptSelect = 'id, subject, exam_board, exam_type, topic, total_marks_awarded, total_available_marks, percentage, predicted_grade, weakness_tags, weakness_analysis, created_at';
const detailAttemptSelect = `${baseAttemptSelect}, questions_payload, answers_payload, marking_report`;

export default function AttemptDetailPage() {
  const { session } = useAuth();
  const params = useParams<{ attemptId: string }>();
  const attemptId = params?.attemptId;
  const [attempt, setAttempt] = useState<AttemptDetail | null>(null);
  const [specTier, setSpecTier] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!session?.user?.id || !attemptId) return;

    const loadAttempt = async () => {
      setIsLoading(true);
      setErrorMessage('');
      const supabase = createClient();

      const detailResponse = await supabase
        .from('exam_practice_attempts')
        .select(detailAttemptSelect)
        .eq('user_id', session.user.id)
        .eq('id', attemptId)
        .single();

      const response = detailResponse.error
        ? await supabase
            .from('exam_practice_attempts')
            .select(baseAttemptSelect)
            .eq('user_id', session.user.id)
            .eq('id', attemptId)
            .single()
        : detailResponse;

      if (response.error || !response.data) {
        console.warn('Practice attempt could not be loaded', response.error?.message ?? response.error ?? 'No row returned');
        setErrorMessage('Could not load this practice attempt.');
        setAttempt(null);
        setSpecTier(null);
      } else {
        const loadedAttempt = response.data as AttemptDetail;
        setAttempt(loadedAttempt);
        const { data: subjectData } = await supabase
          .from('user_subjects')
          .select('spec_tier')
          .eq('user_id', session.user.id)
          .eq('subject', loadedAttempt.subject)
          .eq('exam_board', loadedAttempt.exam_board)
          .eq('exam_type', loadedAttempt.exam_type)
          .maybeSingle();
        setSpecTier((subjectData as { spec_tier?: string | null } | null)?.spec_tier ?? null);
      }
      setIsLoading(false);
    };

    void loadAttempt();
  }, [attemptId, session?.user?.id]);

  const detail = useMemo(() => {
    const questions = asQuestions(attempt?.questions_payload);
    const answers = asAnswers(attempt?.answers_payload);
    const report = asReport(attempt?.marking_report);
    const markedAnswers = report?.markedAnswers ?? [];
    return { questions, answers, report, markedAnswers };
  }, [attempt]);

  const hasQuestionDetail = detail.questions.length > 0 && detail.markedAnswers.length > 0;

  return (
    <main className="space-y-7" aria-labelledby="attempt-detail-title">
      <section className="rounded-2xl border border-slate-200 bg-linear-to-br from-indigo-50 to-white p-6 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.7)] dark:border-white/6 dark:from-[#131B2E] dark:to-[#0d1424]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">Attempt Detail</p>
            <div className="mt-2 flex items-center gap-3">
              <BarChart3 className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
              <h1 id="attempt-detail-title" className="text-3xl font-bold text-slate-900 dark:text-white">
                {attempt?.topic || 'Practice Attempt'}
              </h1>
            </div>
            {attempt ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {getSubjectLabel(attempt.subject)} - {attempt.exam_board.toUpperCase()} {formatTieredExamLabel(attempt.exam_type, specTier, attempt.predicted_grade)} - {formatDateTime(attempt.created_at)}
              </p>
            ) : null}
          </div>
          <Link href="/dashboard/ai-questions/stats" className={buttonStyles({ variant: 'secondary' })}>
            <ArrowLeft className="h-4 w-4" />
            All statistics
          </Link>
        </div>
      </section>

      {errorMessage ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700/60 dark:bg-red-950/35 dark:text-red-200">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />)}
        </div>
      ) : attempt ? (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            {[
              { label: 'Score', value: attempt.percentage === null ? '--' : `${attempt.percentage}%`, icon: Target },
              { label: 'Grade', value: attempt.predicted_grade || 'N/A', icon: Trophy },
              { label: 'Marks', value: `${attempt.total_marks_awarded ?? '--'} / ${attempt.total_available_marks ?? '--'}`, icon: CheckCircle2 },
              { label: 'Questions', value: hasQuestionDetail ? detail.markedAnswers.length.toString() : '--', icon: BarChart3 },
            ].map((item) => {
              const Icon = item.icon;
              const valueClassName = 'mt-3 text-2xl font-bold text-slate-900 dark:text-white';
              return (
                <article key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
                  <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  <p className={valueClassName}>{item.value}</p>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{item.label}</p>
                </article>
              );
            })}
          </section>

          <section className="grid gap-5 lg:grid-cols-[1fr_0.55fr]">
            <div className="space-y-4">
              {detail.report?.sourceMaterial ? (
                <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 dark:border-indigo-500/25 dark:bg-indigo-500/10">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700 dark:text-indigo-300">
                    Source Extract
                  </p>
                  <MarkdownContent className="mt-3 max-h-[34rem] overflow-y-auto pr-2 text-sm leading-7 text-slate-900 dark:text-slate-100" content={detail.report.sourceMaterial} />
                </section>
              ) : null}

              {!hasQuestionDetail ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  This older attempt only has aggregate statistics saved. New marked attempts will include full per-question detail.
                </div>
              ) : (
                detail.markedAnswers.map((marked) => {
                  const question = detail.questions[marked.questionIndex] ?? {};
                  const answer = detail.answers[marked.questionIndex] ?? '';
                  return (
                    <article key={marked.questionIndex} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">Question {marked.questionIndex + 1}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{question.commandWord || 'Exam question'}</p>
                        </div>
                        <span className="rounded-lg bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                          {marked.marksAwarded} / {marked.maxMarks} marks
                        </span>
                      </div>

                      {question.question ? (
                        <MarkdownContent className="mt-4 text-sm font-medium text-slate-900 dark:text-slate-100" content={question.question} />
                      ) : null}

                      {question.questionType === 'mcq' && question.options?.length ? (
                        <div className="mt-3 grid gap-2">
                          {question.options.map((option, index) => {
                            const letter = ['A', 'B', 'C', 'D'][index];
                            return (
                              <p key={letter} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-white/6">
                                <span className="font-semibold">{letter}.</span> <MarkdownContent inline content={option} />
                              </p>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Your answer</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{answer || 'No answer entered.'}</p>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 p-3 dark:border-white/6">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Feedback</p>
                          <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{marked.feedback}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 dark:border-white/6">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Band</p>
                          <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">{marked.band}</p>
                        </div>
                      </div>

                      {marked.improvements?.length ? (
                        <div className="mt-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Improvements</p>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
                            {marked.improvements.map((item) => <li key={item}>{item}</li>)}
                          </ul>
                        </div>
                      ) : null}

                      {marked.exemplarAnswer ? (
                        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Exemplar answer</p>
                          <MarkdownContent className="mt-1 text-sm text-emerald-900 dark:text-emerald-100" content={marked.exemplarAnswer} />
                        </div>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
                <h2 className="font-semibold text-slate-900 dark:text-white">Weakness Analysis</h2>
                <div className="mt-3 space-y-2">
                  {(detail.report?.weaknessAnalysis?.length ? detail.report.weaknessAnalysis : attempt.weakness_analysis ?? []).length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No weakness analysis recorded.</p>
                  ) : (
                    (detail.report?.weaknessAnalysis?.length ? detail.report.weaknessAnalysis : attempt.weakness_analysis ?? []).map((item) => (
                      <p key={item} className="rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-700 dark:border-white/6 dark:text-slate-300">
                        {item}
                      </p>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
                <h2 className="font-semibold text-slate-900 dark:text-white">Grade Boost Advice</h2>
                <div className="mt-3 space-y-2">
                  {detail.report?.gradeBoostAdvice?.length ? (
                    detail.report.gradeBoostAdvice.map((item) => (
                      <p key={item} className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-100">
                        {item}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No grade boost advice recorded for this attempt.</p>
                  )}
                </div>
              </section>
            </aside>
          </section>
        </>
      ) : null}
    </main>
  );
}
