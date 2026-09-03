'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ClipboardList, Loader2 } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { PageHero } from '@/components/ui/feedback';
import { MarkdownContent } from '@/components/MarkdownContent';
import { PlotAnswerInput } from '@/components/plot/PlotAnswerInput';
import { DiagramAnswerInput } from '@/components/diagram/DiagramAnswerInput';
import { useAuth } from '@/hooks/useAuth';
import { PageLoader } from '@/components/PageLoader';
import type { DiagramSpec, DiagramTemplateSelection, PlotSpec } from '@/types';

type AssignmentQuestion = {
  questionType: 'open' | 'mcq' | 'plot' | 'diagram';
  question: string;
  marks: number;
  options: string[];
  correctOption: '' | 'A' | 'B' | 'C' | 'D';
  plotSpec: PlotSpec | null;
  diagramSpec: DiagramSpec | null;
  diagramTemplate?: DiagramTemplateSelection | null;
};

const parseSubmission = (value: string) => {
  try {
    return JSON.parse(value || '');
  } catch {
    return null;
  }
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
  allow_reattempts: boolean;
};

export default function TakeAssignmentPage() {
  const { classId, assignmentId } = useParams<{ classId: string; assignmentId: string }>();
  const router = useRouter();
  const { session, isLoading } = useAuth();

  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [report, setReport] = useState<MarkingReport | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoading || !session) return;

    let cancelled = false;
    const load = async () => {
      setPageLoading(true);

      // The server strips answer-key fields (correctOption/markScheme/
      // modelAnswer) unless this student has already completed the assignment.
      const response = await fetch(`/api/assignments/${assignmentId}`);
      const body = await response.json();

      if (cancelled) return;
      if (!response.ok) {
        router.replace(`/dashboard/classes/${classId}`);
        return;
      }

      const typedAssignment = body.assignment as AssignmentRow;
      setAssignment(typedAssignment);
      setAnswers(new Array(typedAssignment.questions_payload?.length ?? 0).fill(''));

      const attemptRow = body.attempt as { answers_payload: string[] | null; ai_feedback: MarkingReport | null; status: string } | null;
      if (attemptRow?.status === 'completed') {
        setAnswers(attemptRow.answers_payload ?? []);
        setReport(attemptRow.ai_feedback ?? null);
      }

      setPageLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, router, classId, assignmentId]);

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

    setElapsedSeconds(0);
    setIsSubmitting(true);
    try {
      // The server fetches the stored questions and curriculum details for
      // this assignment, marks the answers, and persists the attempt itself.
      const response = await fetch('/api/ai/mark-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, answers }),
      });
      const body = await response.json();
      if (response.status === 409 && body.report) {
        // Already submitted (e.g. from another tab) -- show the stored report.
        setReport(body.report as MarkingReport);
        setIsSubmitting(false);
        return;
      }
      if (!response.ok) {
        setError(body.error || 'Marking failed.');
        setIsSubmitting(false);
        return;
      }

      setReport(body.report as MarkingReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit answers.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Marking is a single model call, so there are no honest intermediate stages
  // to report. What IS real is how long it has been running and how many answers
  // the model was actually given, so show those rather than inventing a
  // progress bar that does not correspond to anything.
  useEffect(() => {
    if (!isSubmitting) return;
    const id = setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, [isSubmitting]);

  // MCQ, plot and diagram questions are marked by code the moment they arrive;
  // only written answers wait on the model.
  const writtenAnswerCount = (assignment?.questions_payload ?? []).filter(
    (question) => !['mcq', 'plot', 'diagram'].includes(question.questionType)
  ).length;

  if (isLoading || pageLoading || !assignment) {
    return <PageLoader text="Loading assignment..." />;
  }

  const questions = assignment.questions_payload ?? [];
  const isReview = !!report;

  return (
    <div className="space-y-6">
      <PageHero
        icon={ClipboardList}
        title={assignment.title}
        description={assignment.description || undefined}
        backHref={`/dashboard/classes/${classId}`}
        backLabel="Back to class"
      />

      {assignment.source_material ? (
        <div className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
          <MarkdownContent content={assignment.source_material} />
        </div>
      ) : null}

      {report ? (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 dark:border-indigo-500/30 dark:bg-indigo-500/10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-content">
              {Math.round(report.totalMarksAwarded)}/{Math.round(report.totalAvailableMarks)} marks · {Math.round(report.percentage)}% · Grade equivalent {report.predictedGrade}
            </h2>
            {assignment.allow_reattempts && (
              <button type="button" onClick={() => setReport(null)} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
                Try again
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-content-subtle">
            What this score alone would be worth. Your predicted grade on the dashboard is separate — it builds up
            from every attempt across the specification.
          </p>
          <p className="mt-2 text-sm text-content-muted dark:text-slate-300">{report.summary}</p>
        </div>
      ) : null}

      <div className="space-y-4">
        {questions.map((question, index) => {
          const marked = report?.markedAnswers.find((m) => m.questionIndex === index);
          return (
            <div key={index} className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <MarkdownContent content={`**${index + 1}.** ${question.question}`} />
                <span className="shrink-0 text-xs font-medium text-content-subtle">{question.marks} marks</span>
              </div>

              <div className="mt-3">
                {question.questionType === 'mcq' ? (
                  <div className="space-y-1.5">
                    {question.options.map((option, optionIndex) => {
                      const letter = ['A', 'B', 'C', 'D'][optionIndex] as 'A' | 'B' | 'C' | 'D';
                      return (
                        <label key={letter} className="flex items-center gap-2 text-sm text-content-muted dark:text-slate-300">
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
                    studentSubmission={isReview ? parseSubmission(answers[index] ?? '') : undefined}
                  />
                ) : question.questionType === 'diagram' && question.diagramSpec ? (
                  <DiagramAnswerInput
                    diagramSpec={question.diagramSpec}
                    diagramTemplate={question.diagramTemplate}
                    value={answers[index] ?? ''}
                    onChange={(value) => updateAnswer(index, value)}
                    mode={isReview ? 'review' : 'answer'}
                    studentSubmission={isReview ? parseSubmission(answers[index] ?? '') : undefined}
                  />
                ) : (
                  <textarea
                    value={answers[index] ?? ''}
                    onChange={(e) => updateAnswer(index, e.target.value)}
                    disabled={isReview}
                    rows={4}
                    placeholder="Write your answer..."
                    className="w-full rounded-lg border border-subtle px-3 py-2 text-sm outline-none focus:border-accent disabled:text-content dark:disabled:bg-surface/3"
                  />
                )}
              </div>

              {marked ? (
                <div className="mt-3 rounded-lg bg-surface-sunken p-3 text-sm dark:bg-surface/3">
                  <p className="font-semibold text-content-muted text-content">
                    {marked.marksAwarded}/{marked.maxMarks} · {marked.band}
                  </p>
                  <p className="mt-1 text-content-muted">{marked.feedback}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {isSubmitting && (
        <div className="flex items-start gap-3 rounded-xl border border-subtle bg-surface-sunken p-4 dark:bg-surface/3">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent" />
          <div>
            <p className="text-sm font-medium text-content">
              {writtenAnswerCount > 0
                ? `Marking ${writtenAnswerCount} written answer${writtenAnswerCount === 1 ? '' : 's'} against the mark scheme`
                : 'Marking your answers'}
            </p>
            <p className="mt-0.5 text-xs text-content-subtle">
              {elapsedSeconds}s elapsed · usually under a minute. Your attempt is saved as soon as marking finishes, so
              this will not be lost.
            </p>
          </div>
        </div>
      )}

      {!isReview && (
        <button type="button" onClick={handleSubmit} disabled={isSubmitting} className={buttonStyles({ variant: 'primary', size: 'lg' })}>
          {isSubmitting ? 'Marking...' : 'Submit answers'}
        </button>
      )}
    </div>
  );
}
