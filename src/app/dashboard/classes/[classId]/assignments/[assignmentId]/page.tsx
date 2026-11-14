'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ClipboardList, Loader2, Radar } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/feedback';
import { Alert, fieldStyles } from '@/components/ui/field';
import { Chip, Meter, MonoLabel, Panel, PanelHeading, StatusBar, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { MarkdownContent } from '@/components/MarkdownContent';
import { PlotAnswerInput } from '@/components/plot/PlotAnswerInput';
import { DiagramAnswerInput } from '@/components/diagram/DiagramAnswerInput';
import { useAuth } from '@/hooks/useAuth';
import { PageLoader } from '@/components/PageLoader';
import type { DiagramSpec, DiagramTemplateSelection, PlotSpec } from '@/types';
// GAMIFICATION PAUSED: import { announceXp } from '@/lib/gamification/client';

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
      // GAMIFICATION PAUSED: announceXp(body.xp);
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

  const answeredCount = questions.filter((_, index) => (answers[index] ?? '').trim()).length;
  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);

  const reportColumn = (
    <>
      <PanelHeading icon={Radar} aside={report ? <Chip tone="success">Marked</Chip> : null}>
        Report
      </PanelHeading>
      {report ? (
        <>
          <Panel>
            <div className="flex items-baseline justify-between gap-2">
              <MonoLabel>Grade equivalent</MonoLabel>
              <span className="font-mono text-[11px] text-content-subtle">This assignment only</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="font-mono text-4xl font-bold text-content">{report.predictedGrade}</p>
              <div className="text-right">
                <p className="font-mono text-2xl font-semibold text-content">{Math.round(report.percentage)}%</p>
                <p className="font-mono text-xs text-content-subtle">
                  {Math.round(report.totalMarksAwarded)}/{Math.round(report.totalAvailableMarks)} marks
                </p>
              </div>
            </div>
            <Meter fraction={report.percentage / 100} className="mt-3" label="Score" />
            <p className="mt-3 text-xs text-content-subtle">
              What this score alone would be worth. Your predicted grade on the dashboard is separate — it builds up from every attempt
              across the specification.
            </p>
          </Panel>
          <Panel>
            <PanelHeading as="h3">Summary</PanelHeading>
            <p className="mt-2 text-[13px] text-content-muted">{report.summary}</p>
          </Panel>
          {assignment.allow_reattempts && (
            <button
              type="button"
              onClick={() => setReport(null)}
              className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'w-full justify-center' })}
            >
              Try again
            </button>
          )}
        </>
      ) : (
        <>
          <Panel>
            <div className="flex items-baseline justify-between gap-2">
              <MonoLabel>Answered</MonoLabel>
              <span className="font-mono text-xs text-content-subtle">
                {answeredCount} / {questions.length}
              </span>
            </div>
            <Meter fraction={questions.length ? answeredCount / questions.length : 0} className="mt-3" label="Questions answered" />
          </Panel>
          <Panel>
            <p className="text-sm font-semibold text-content">Your report appears here</p>
            <p className="mt-1 text-[13px] text-content-subtle">
              Multiple-choice, graph and diagram answers are marked straight away. Written answers are marked against the mark
              scheme.
            </p>
          </Panel>
        </>
      )}
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={ClipboardList}
        eyebrow="Classes / Assignment"
        title={assignment.title}
        description={assignment.description || undefined}
        backHref={`/dashboard/classes/${classId}`}
        backLabel="Back to class"
        actions={
          <>
            <Chip>● {questions.length} questions</Chip>
            <Chip tone="success">{totalMarks} marks</Chip>
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        <StatusBar>
          <span className="font-semibold text-content">
            {answeredCount} / {questions.length} answered
          </span>
          {isReview ? <Chip>Marked</Chip> : null}
        </StatusBar>

        <div className="flex-1 space-y-4 p-5">
          {assignment.source_material ? (
            <section className="rounded-lg border border-subtle bg-surface-sunken p-5">
              <MonoLabel className="mb-2">Source material</MonoLabel>
              <MarkdownContent content={assignment.source_material} />
            </section>
          ) : null}

          {questions.map((question, index) => {
            const marked = report?.markedAnswers.find((m) => m.questionIndex === index);
            return (
              <article key={index} className="rounded-lg border border-subtle bg-surface p-5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <MonoLabel className="mr-1">Question {String(index + 1).padStart(2, '0')}</MonoLabel>
                  <Chip tone="inverse">{question.marks} marks</Chip>
                </div>
                <MarkdownContent content={question.question} />

                <div className="mt-3">
                  {question.questionType === 'mcq' ? (
                    <div className="space-y-1.5">
                      {question.options.map((option, optionIndex) => {
                        const letter = ['A', 'B', 'C', 'D'][optionIndex] as 'A' | 'B' | 'C' | 'D';
                        return (
                          <label key={letter} className="flex items-center gap-2 text-sm text-content">
                            <input
                              type="radio"
                              name={`question-${index}`}
                              checked={answers[index] === letter}
                              disabled={isReview}
                              onChange={() => updateAnswer(index, letter)}
                            />
                            <span className={isReview && letter === question.correctOption ? 'font-semibold text-success' : ''}>
                              <span className="font-mono">{letter}.</span> {option}
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
                    <label className="block">
                      <MonoLabel className="mb-1">Your answer</MonoLabel>
                      <textarea
                        value={answers[index] ?? ''}
                        onChange={(e) => updateAnswer(index, e.target.value)}
                        disabled={isReview}
                        rows={4}
                        placeholder="Write your answer..."
                        className={fieldStyles()}
                      />
                    </label>
                  )}
                </div>

                {marked ? (
                  <div className="mt-3 rounded-lg border border-subtle bg-surface-sunken p-3 text-sm">
                    <p className="font-mono text-xs font-semibold text-content">
                      {marked.marksAwarded}/{marked.maxMarks} · {marked.band}
                    </p>
                    <p className="mt-1 text-content-muted">{marked.feedback}</p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        {error || isSubmitting || !isReview ? (
          <div className="space-y-3 border-t border-subtle p-4">
            {error ? <Alert>{error}</Alert> : null}

            {isSubmitting && (
              <div className="flex items-start gap-3 rounded-lg border border-subtle bg-surface-sunken p-3">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent" />
                <div>
                  <p className="text-sm font-medium text-content">
                    {writtenAnswerCount > 0
                      ? `Marking ${writtenAnswerCount} written answer${writtenAnswerCount === 1 ? '' : 's'} against the mark scheme`
                      : 'Marking your answers'}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-content-subtle">
                    {elapsedSeconds}s elapsed · usually under a minute. Your attempt is saved as soon as marking finishes, so this will
                    not be lost.
                  </p>
                </div>
              </div>
            )}

            {!isReview && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-xs text-content-subtle max-sm:hidden">
                  {answeredCount} of {questions.length} answered
                </p>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className={buttonStyles({ variant: 'primary', className: 'max-sm:w-full' })}
                >
                  {isSubmitting ? 'Marking...' : 'Submit answers'}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </WorkspaceBody>
    </Workspace>
  );
}
