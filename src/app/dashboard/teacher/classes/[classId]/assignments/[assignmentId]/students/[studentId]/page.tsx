'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, History } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { MarkdownContent } from '@/components/MarkdownContent';
import { PlotAnswerInput } from '@/components/plot/PlotAnswerInput';
import { PageLoader } from '@/components/PageLoader';
import { useToast } from '@/components/ToastProvider';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { scoreTextTone } from '@/lib/scoreTone';
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
  strengths: string[];
  improvements: string[];
  exemplarAnswer: string;
  teacherAdjusted?: boolean;
};

type MarkingReport = {
  markedAnswers: MarkedAnswer[];
  totalMarksAwarded: number;
  totalAvailableMarks: number;
  percentage: number;
  predictedGrade: string;
  summary: string;
};

export default function TeacherStudentAnswersPage() {
  const { classId, assignmentId, studentId } = useParams<{ classId: string; assignmentId: string; studentId: string }>();
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const supabase = createClient();
  const { showToast } = useToast();

  const [pageLoading, setPageLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [studentName, setStudentName] = useState('Student');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [questions, setQuestions] = useState<AssignmentQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [attemptId, setAttemptId] = useState('');
  const [report, setReport] = useState<MarkingReport | null>(null);
  const [originalReport, setOriginalReport] = useState<MarkingReport | null>(null);
  const [overriddenAt, setOverriddenAt] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [edits, setEdits] = useState<Record<number, number>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (isLoading || !session) return;
    if (profile && profile.role !== 'teacher') {
      router.replace('/dashboard');
      return;
    }

    let cancelled = false;
    const load = async () => {
      setPageLoading(true);

      const { data: teacherRow } = await supabase.from('teachers').select('id').eq('user_id', session.user.id).maybeSingle();
      if (cancelled) return;
      if (!teacherRow) {
        router.replace('/onboarding/teacher');
        return;
      }

      const { data: assignmentRow } = await supabase
        .from('assignments')
        .select('id, title, questions_payload')
        .eq('id', assignmentId)
        .eq('teacher_id', (teacherRow as { id: string }).id)
        .maybeSingle();
      if (cancelled) return;
      if (!assignmentRow) {
        setNotFound(true);
        setPageLoading(false);
        return;
      }
      setAssignmentTitle((assignmentRow as { title: string }).title);
      setQuestions((assignmentRow as { questions_payload: AssignmentQuestion[] }).questions_payload ?? []);

      const { data: profileRow } = await supabase.from('user_profiles').select('full_name, email').eq('id', studentId).maybeSingle();
      if (!cancelled && profileRow) {
        const typed = profileRow as { full_name: string | null; email: string | null };
        setStudentName(typed.full_name || typed.email || 'Student');
      }

      const { data: attemptRow } = await supabase
        .from('assignment_attempts')
        .select('id, status, answers_payload, ai_feedback, ai_feedback_original, teacher_overridden_at')
        .eq('assignment_id', assignmentId)
        .eq('student_id', studentId)
        .maybeSingle();
      if (cancelled) return;
      const typedAttempt = attemptRow as {
        id: string;
        status: string;
        answers_payload: string[] | null;
        ai_feedback: MarkingReport | null;
        ai_feedback_original: MarkingReport | null;
        teacher_overridden_at: string | null;
      } | null;

      if (!typedAttempt || typedAttempt.status !== 'completed') {
        setNotFound(true);
        setPageLoading(false);
        return;
      }
      setAttemptId(typedAttempt.id);
      setAnswers(typedAttempt.answers_payload ?? []);
      setReport(typedAttempt.ai_feedback);
      setOriginalReport(typedAttempt.ai_feedback_original);
      setOverriddenAt(typedAttempt.teacher_overridden_at);

      setPageLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, profile, router, supabase, assignmentId, studentId]);

  const displayedReport = showOriginal && originalReport ? originalReport : report;

  const hasEdits = useMemo(() => Object.keys(edits).length > 0, [edits]);

  const updateEdit = (questionIndex: number, value: number, maxMarks: number) => {
    const clamped = Math.max(0, Math.min(maxMarks, value));
    setEdits((prev) => ({ ...prev, [questionIndex]: clamped }));
  };

  const handleSave = async () => {
    if (!hasEdits) return;
    setSaveError('');
    setIsSaving(true);
    try {
      const overrides = Object.entries(edits).map(([questionIndex, marksAwarded]) => ({
        questionIndex: Number(questionIndex),
        marksAwarded,
      }));
      const response = await fetch(`/api/teacher/assignment-attempts/${attemptId}/override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      });
      const body = await response.json();
      if (!response.ok) {
        setSaveError(body.error || 'Failed to save adjustments.');
        setIsSaving(false);
        return;
      }
      setReport(body.report as MarkingReport);
      setOriginalReport(body.originalReport as MarkingReport);
      setOverriddenAt(body.teacherOverriddenAt as string);
      setEdits({});
      showToast('success', 'Marks updated.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save adjustments.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || pageLoading) {
    return <PageLoader text="Loading student answers..." />;
  }

  if (notFound || !displayedReport) {
    return (
      <div className="space-y-4">
        <Link
          href={`/dashboard/teacher/classes/${classId}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to class
        </Link>
        <p className="text-sm text-slate-500 dark:text-slate-400">This student hasn&apos;t completed this assignment yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/teacher/classes/${classId}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to class
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{assignmentTitle}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{studentName}&apos;s answers</p>
      </div>

      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 dark:border-indigo-500/30 dark:bg-indigo-500/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {Math.round(displayedReport.totalMarksAwarded)}/{Math.round(displayedReport.totalAvailableMarks)} marks ·{' '}
            <span className={scoreTextTone(displayedReport.percentage)}>{Math.round(displayedReport.percentage)}%</span> · Predicted grade{' '}
            {displayedReport.predictedGrade}
          </h2>
          {overriddenAt && originalReport && (
            <button
              type="button"
              onClick={() => setShowOriginal((v) => !v)}
              className={buttonStyles({ variant: 'secondary', size: 'sm' })}
            >
              <History className="h-4 w-4" />
              {showOriginal ? 'Show adjusted marking' : 'Show original AI marking'}
            </button>
          )}
        </div>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{displayedReport.summary}</p>
        {overriddenAt && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Adjusted by you on {new Date(overriddenAt).toLocaleString()}.
          </p>
        )}
      </div>

      <div className="space-y-4">
        {questions.map((question, index) => {
          const marked = displayedReport.markedAnswers.find((m) => m.questionIndex === index);
          const isEditing = !showOriginal;
          const currentValue = edits[index] ?? marked?.marksAwarded ?? 0;
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
                          <input type="radio" checked={answers[index] === letter} disabled readOnly />
                          <span className={letter === question.correctOption ? 'font-semibold text-emerald-600 dark:text-emerald-400' : ''}>
                            {letter}. {option}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : question.questionType === 'plot' && question.plotSpec ? (
                  <PlotAnswerInput plotSpec={question.plotSpec} value={answers[index] ?? ''} onChange={() => {}} mode="review" />
                ) : (
                  <textarea
                    value={answers[index] ?? ''}
                    disabled
                    rows={4}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none disabled:bg-slate-50 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100 dark:disabled:bg-white/3"
                  />
                )}
              </div>

              {marked ? (
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-white/3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{marked.band}</p>
                    {isEditing ? (
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                        Marks:
                        <input
                          type="number"
                          min={0}
                          max={marked.maxMarks}
                          value={currentValue}
                          onChange={(e) => updateEdit(index, Number(e.target.value) || 0, marked.maxMarks)}
                          className="w-14 rounded border border-slate-300 px-2 py-0.5 text-sm dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
                        />
                        / {marked.maxMarks}
                      </label>
                    ) : (
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                        {marked.marksAwarded}/{marked.maxMarks}
                      </p>
                    )}
                    {marked.teacherAdjusted && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                        Adjusted
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">{marked.feedback}</p>
                  {marked.strengths.length > 0 && (
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">Strengths: {marked.strengths.join('; ')}</p>
                  )}
                  {marked.improvements.length > 0 && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Improvements: {marked.improvements.join('; ')}</p>
                  )}
                  {marked.exemplarAnswer && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Exemplar: {marked.exemplarAnswer}</p>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {!showOriginal && (
        <div className="flex items-center justify-end gap-3">
          {saveError ? <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p> : null}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!hasEdits || isSaving}
            className={buttonStyles({ variant: 'primary' })}
          >
            {isSaving ? 'Saving...' : 'Save adjustments'}
          </button>
        </div>
      )}
    </div>
  );
}
