'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { BarChart3, Radar } from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { PageHeader } from '@/components/ui/feedback';
import { Alert } from '@/components/ui/field';
import { Chip, Meter, MonoLabel, Panel, PanelHeading, Stat, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { getExamBoardLabel, getExamTypeLabel, getSubjectLabel } from '@/lib/ai/subjectConfig';
import { gcseTierLabelForGrade } from '@/lib/gradeTone';
import { findSavedTierForSubject } from '@/lib/ai/studentSubjects';

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
        const tier = await findSavedTierForSubject(supabase, {
          userId: session.user.id,
          qualificationLabel: getExamTypeLabel(loadedAttempt.exam_type),
          boardLabel: getExamBoardLabel(loadedAttempt.exam_board),
          subjectLabel: getSubjectLabel(loadedAttempt.subject),
        });
        setSpecTier(tier);
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

  const weaknessItems = attempt
    ? detail.report?.weaknessAnalysis?.length
      ? detail.report.weaknessAnalysis
      : attempt.weakness_analysis ?? []
    : [];

  const reportColumn = attempt ? (
    <>
      <PanelHeading icon={Radar}>Report</PanelHeading>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Score" value={attempt.percentage === null ? '--' : `${attempt.percentage}%`} />
        <Stat label="Grade" value={attempt.predicted_grade || 'N/A'} tone="accent" />
        <Stat label="Marks" value={`${attempt.total_marks_awarded ?? '--'}/${attempt.total_available_marks ?? '--'}`} />
        <Stat label="Questions" value={hasQuestionDetail ? detail.markedAnswers.length : '--'} />
      </div>
      {attempt.percentage !== null ? <Meter fraction={attempt.percentage / 100} label="Score" /> : null}

      <Panel>
        <PanelHeading as="h3">Weakness analysis</PanelHeading>
        <ul className="mt-3 space-y-2 text-[13px] text-content-muted">
          {weaknessItems.length === 0 ? (
            <li className="text-content-subtle">No weakness analysis recorded.</li>
          ) : (
            weaknessItems.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                <span>{item}</span>
              </li>
            ))
          )}
        </ul>
      </Panel>

      <Panel>
        <PanelHeading as="h3">Grade boost advice</PanelHeading>
        <ul className="mt-3 space-y-2 text-[13px] text-content-muted">
          {detail.report?.gradeBoostAdvice?.length ? (
            detail.report.gradeBoostAdvice.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                <span>{item}</span>
              </li>
            ))
          ) : (
            <li className="text-content-subtle">No grade boost advice recorded for this attempt.</li>
          )}
        </ul>
      </Panel>
    </>
  ) : null;

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={BarChart3}
        eyebrow="Practice / Marked attempt"
        titleId="attempt-detail-title"
        title={attempt?.topic || 'Practice Attempt'}
        backHref="/dashboard/ai-questions/stats"
        backLabel="All statistics"
        description={attempt ? `${getSubjectLabel(attempt.subject)} · ${formatDateTime(attempt.created_at)}` : undefined}
        actions={
          attempt ? (
            <>
              <Chip>
                ● {attempt.exam_board.toUpperCase()} {formatTieredExamLabel(attempt.exam_type, specTier, attempt.predicted_grade)}
              </Chip>
              {attempt.percentage !== null ? <Chip tone="success">{attempt.percentage}% scored</Chip> : null}
            </>
          ) : null
        }
      />

      <WorkspaceBody aside={reportColumn}>
        {errorMessage ? (
          <div className="border-b border-subtle p-4">
            <Alert>{errorMessage}</Alert>
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-lg bg-surface-sunken" />
            ))}
          </div>
        ) : attempt ? (
          <div className="flex-1 space-y-4 p-5">
            {detail.report?.sourceMaterial ? (
              <section className="rounded-lg border border-subtle bg-surface-sunken p-5">
                <MonoLabel>Source extract</MonoLabel>
                <p className="mt-1 text-xs text-content-subtle">Written for this practice paper. Not an extract from a real publication.</p>
                <MarkdownContent
                  className="mt-3 max-h-136 overflow-y-auto pr-2 text-sm leading-7 text-content"
                  content={detail.report.sourceMaterial}
                />
              </section>
            ) : null}

            {!hasQuestionDetail ? (
              <Alert tone="warning">
                This older attempt only has aggregate statistics saved. New marked attempts will include full per-question detail.
              </Alert>
            ) : (
              detail.markedAnswers.map((marked) => {
                const question = detail.questions[marked.questionIndex] ?? {};
                const answer = detail.answers[marked.questionIndex] ?? '';
                return (
                  <article key={marked.questionIndex} className="rounded-lg border border-subtle bg-surface p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <MonoLabel className="mr-1">Question {String(marked.questionIndex + 1).padStart(2, '0')}</MonoLabel>
                        <Chip>{question.commandWord || 'Exam question'}</Chip>
                      </div>
                      <Chip tone="inverse">
                        {marked.marksAwarded} / {marked.maxMarks} marks
                      </Chip>
                    </div>

                    {question.question ? (
                      <MarkdownContent className="mt-4 text-sm font-medium text-content" content={question.question} />
                    ) : null}

                    {question.questionType === 'mcq' && question.options?.length ? (
                      <div className="mt-3 grid gap-2">
                        {question.options.map((option, index) => {
                          const letter = ['A', 'B', 'C', 'D'][index];
                          return (
                            <p key={letter} className="rounded-lg border border-subtle px-3 py-2 text-sm">
                              <span className="font-mono font-semibold">{letter}.</span> <MarkdownContent inline content={option} />
                            </p>
                          );
                        })}
                      </div>
                    ) : null}

                    <div className="mt-4 rounded-lg border border-subtle bg-surface-sunken p-3">
                      <MonoLabel>Your answer</MonoLabel>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-content">{answer || 'No answer entered.'}</p>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                      <div>
                        <MonoLabel>Feedback</MonoLabel>
                        <p className="mt-1 text-sm text-content-muted">{marked.feedback}</p>
                      </div>
                      <div>
                        <MonoLabel>Band</MonoLabel>
                        <p className="mt-1 text-sm font-semibold text-content">{marked.band}</p>
                      </div>
                    </div>

                    {marked.improvements?.length ? (
                      <div className="mt-4">
                        <MonoLabel className="text-info">Improvements</MonoLabel>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-content-muted">
                          {marked.improvements.map((item, index) => (
                            <li key={`${item}-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {marked.exemplarAnswer ? (
                      <div className="mt-4 rounded-lg border border-success/30 bg-success-muted p-3">
                        <MonoLabel className="text-success">Exemplar answer</MonoLabel>
                        <MarkdownContent className="mt-1 text-sm text-content" content={marked.exemplarAnswer} />
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        ) : null}
      </WorkspaceBody>
    </Workspace>
  );
}
