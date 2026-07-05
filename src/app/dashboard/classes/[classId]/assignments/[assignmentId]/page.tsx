'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { MarkdownContent } from '@/components/MarkdownContent';
import { PlotAnswerInput } from '@/components/plot/PlotAnswerInput';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { buildSpecString } from '@/lib/ai/subjectConfig';
import { normalizeBoard, normalizeExamType } from '@/lib/ai/validation';
import type { PlotSpec } from '@/types';

type AssignmentQuestion = {
  questionType: 'open' | 'mcq' | 'plot';
  question: string;
  marks: number;
  options: string[];
  correctOption: '' | 'A' | 'B' | 'C' | 'D';
  plotSpec: PlotSpec | null;
};

type MarkedAnswer = {
  questionIndex: number;
  marksAwarded: number;
  maxMarks: number;
  band: string;
  feedback: string;
};

type MarkingReport = {
  markedAnswers: MarkedAnswer[];
  totalMarksAwarded: number;
  totalAvailableMarks: number;
  percentage: number;
  predictedGrade: string;
  summary: string;
};

type AssignmentRow = {
  id: string;
  title: string;
  description: string | null;
  questions_payload: AssignmentQuestion[];
  source_material: string | null;
  classes: {
    specifications: {
      name: string;
      tier: string | null;
      subjects: { name: string; exam_boards: { name: string; qualifications: { name: string } | null } | null } | null;
    } | null;
  } | null;
};

export default function TakeAssignmentPage() {
  const { classId, assignmentId } = useParams<{ classId: string; assignmentId: string }>();
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const supabase = createClient();

  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [report, setReport] = useState<MarkingReport | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoading || !session) return;

    let cancelled = false;
    const load = async () => {
      setPageLoading(true);

      const { data: assignmentRow, error: assignmentError } = await supabase
        .from('assignments')
        .select(
          'id, title, description, questions_payload, source_material, classes ( specifications ( name, tier, subjects ( name, exam_boards ( name, qualifications ( name ) ) ) ) )'
        )
        .eq('id', assignmentId)
        .maybeSingle();

      if (cancelled) return;
      if (assignmentError || !assignmentRow) {
        router.replace(`/dashboard/classes/${classId}`);
        return;
      }
      const typedAssignment = assignmentRow as unknown as AssignmentRow;
      setAssignment(typedAssignment);
      setAnswers(new Array(typedAssignment.questions_payload?.length ?? 0).fill(''));

      const { data: attemptRow } = await supabase
        .from('assignment_attempts')
        .select('answers_payload, ai_feedback, status')
        .eq('assignment_id', assignmentId)
        .eq('student_id', session.user.id)
        .maybeSingle();

      if (!cancelled && attemptRow?.status === 'completed') {
        setAnswers((attemptRow.answers_payload as string[]) ?? []);
        setReport((attemptRow.ai_feedback as MarkingReport) ?? null);
      }

      setPageLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, router, supabase, classId, assignmentId]);

  const updateAnswer = (index: number, value: string) => {
    setAnswers((prev) => prev.map((a, i) => (i === index ? value : a)));
  };

  const handleSubmit = async () => {
    if (!assignment || !session) return;
    setError('');

    const answeredCount = answers.filter((a) => a.trim().length > 0).length;
    if (answeredCount === 0) {
      setError('Answer at least one question before submitting.');
      return;
    }

    const subjectChain = assignment.classes?.specifications?.subjects;
    const board = subjectChain?.exam_boards;
    const qualification = board?.qualifications;
    const examBoard = normalizeBoard(board?.name);
    const examType = normalizeExamType(qualification?.name);
    if (!subjectChain || !examBoard || !examType) {
      setError('This assignment is missing curriculum details.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/ai/mark-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: assignment.title,
          subject: subjectChain.name.toLowerCase(),
          examBoard,
          examType,
          specification: buildSpecString(assignment.classes?.specifications?.name ?? '', assignment.classes?.specifications?.tier ?? '', ''),
          sourceMaterial: assignment.source_material || '',
          questions: assignment.questions_payload,
          answers,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error || 'Marking failed.');
        setIsSubmitting(false);
        return;
      }

      const markedReport = body.report as MarkingReport;
      const { error: saveError } = await supabase.from('assignment_attempts').upsert(
        {
          assignment_id: assignmentId,
          student_id: session.user.id,
          completed_at: new Date().toISOString(),
          answers_payload: answers,
          score: markedReport.totalMarksAwarded,
          percentage: markedReport.percentage,
          predicted_grade: markedReport.predictedGrade,
          ai_feedback: markedReport,
          status: 'completed',
        },
        { onConflict: 'assignment_id,student_id' }
      );

      if (saveError) {
        setError('Marked, but could not save your attempt. Please try again.');
        setIsSubmitting(false);
        return;
      }

      setReport(markedReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit answers.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || pageLoading || !assignment) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading assignment...</p>;
  }

  const questions = assignment.questions_payload ?? [];
  const isReview = !!report;

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/classes/${classId}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to class
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{assignment.title}</h1>
        {assignment.description ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{assignment.description}</p> : null}
      </div>

      {assignment.source_material ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <MarkdownContent content={assignment.source_material} />
        </div>
      ) : null}

      {report ? (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 dark:border-indigo-500/30 dark:bg-indigo-500/10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {Math.round(report.totalMarksAwarded)}/{Math.round(report.totalAvailableMarks)} marks · {Math.round(report.percentage)}% · Predicted grade {report.predictedGrade}
          </h2>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{report.summary}</p>
        </div>
      ) : null}

      <div className="space-y-4">
        {questions.map((question, index) => {
          const marked = report?.markedAnswers.find((m) => m.questionIndex === index);
          return (
            <div key={index} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
              <div className="flex items-start justify-between gap-3">
                <MarkdownContent content={`**${index + 1}.** ${question.question}`} />
                <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">{question.marks} marks</span>
              </div>

              <div className="mt-3">
                {question.questionType === 'mcq' ? (
                  <div className="space-y-1.5">
                    {question.options.map((option, optionIndex) => {
                      const letter = ['A', 'B', 'C', 'D'][optionIndex] as 'A' | 'B' | 'C' | 'D';
                      return (
                        <label key={letter} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <input
                            type="radio"
                            name={`question-${index}`}
                            checked={answers[index] === letter}
                            disabled={isReview}
                            onChange={() => updateAnswer(index, letter)}
                          />
                          <span className={isReview && letter === question.correctOption ? 'font-semibold text-emerald-600 dark:text-emerald-400' : ''}>
                            {letter}. {option}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : question.questionType === 'plot' && question.plotSpec ? (
                  <PlotAnswerInput
                    plotSpec={question.plotSpec}
                    value={answers[index] ?? ''}
                    onChange={(value) => updateAnswer(index, value)}
                    mode={isReview ? 'review' : 'answer'}
                  />
                ) : (
                  <textarea
                    value={answers[index] ?? ''}
                    onChange={(e) => updateAnswer(index, e.target.value)}
                    disabled={isReview}
                    rows={4}
                    placeholder="Write your answer..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 disabled:bg-slate-50 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100 dark:disabled:bg-white/3"
                  />
                )}
              </div>

              {marked ? (
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-white/3">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    {marked.marksAwarded}/{marked.maxMarks} · {marked.band}
                  </p>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">{marked.feedback}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {!isReview && (
        <button type="button" onClick={handleSubmit} disabled={isSubmitting} className={buttonStyles({ variant: 'primary', size: 'lg' })}>
          {isSubmitting ? 'Marking...' : 'Submit answers'}
        </button>
      )}
    </div>
  );
}
