'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ClipboardList, Lock, Pencil, Send } from 'lucide-react';
import { PageHero } from '@/components/ui/feedback';
import { buttonStyles } from '@/components/ui/button';
import { MathContent } from '@/components/MathContent';
import { PlotAnswerInput } from '@/components/plot/PlotAnswerInput';
import { DiagramAnswerInput } from '@/components/diagram/DiagramAnswerInput';
import { PageLoader } from '@/components/PageLoader';
import { useToast } from '@/components/ToastProvider';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { scoreTextTone } from '@/lib/scoreTone';
import { verifyQuestions } from '@/lib/assignments/verifyQuestions';
import type { ExamQuestion } from '@/app/api/ai/generate-questions/route';

type AssignmentRow = {
  id: string;
  title: string;
  description: string | null;
  assignment_type: string;
  status: 'draft' | 'published';
  published_at: string | null;
  due_date: string | null;
  questions_payload: ExamQuestion[] | null;
  topics: { name: string } | null;
};

type AttemptRow = {
  student_id: string;
  status: string;
  percentage: number | null;
};

type StudentRow = { student_id: string; name: string };

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;
const inputClass = 'w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-sm text-content outline-none focus:border-accent';
const fieldLabelClass = 'text-xs font-medium text-content-subtle';

export default function TeacherAssignmentDetailPage() {
  const { classId, assignmentId } = useParams<{ classId: string; assignmentId: string }>();
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const supabase = createClient();
  const { showToast } = useToast();

  const [pageLoading, setPageLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [className, setClassName] = useState('');
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  const [drafts, setDrafts] = useState<ExamQuestion[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [actionError, setActionError] = useState('');

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
        .select('id, title, description, assignment_type, status, published_at, due_date, questions_payload, topics ( name )')
        .eq('id', assignmentId)
        .eq('class_id', classId)
        .eq('teacher_id', (teacherRow as { id: string }).id)
        .maybeSingle();
      if (cancelled) return;
      if (!assignmentRow) {
        setNotFound(true);
        setPageLoading(false);
        return;
      }
      setAssignment(assignmentRow as unknown as AssignmentRow);

      const { data: classRow } = await supabase.from('classes').select('name').eq('id', classId).maybeSingle();
      if (!cancelled && classRow) setClassName((classRow as { name: string }).name);

      const { data: attemptRows } = await supabase
        .from('assignment_attempts')
        .select('student_id, status, percentage')
        .eq('assignment_id', assignmentId);
      if (!cancelled) setAttempts((attemptRows as AttemptRow[]) ?? []);

      const { data: rosterRows } = await supabase
        .from('class_students')
        .select('student_id')
        .eq('class_id', classId)
        .eq('status', 'active');
      if (cancelled) return;
      const studentIds = ((rosterRows ?? []) as { student_id: string }[]).map((r) => r.student_id);
      if (studentIds.length > 0) {
        const { data: profileRows } = await supabase.from('user_profiles').select('id, full_name, email').in('id', studentIds);
        const profiles = (profileRows ?? []) as { id: string; full_name: string | null; email: string | null }[];
        if (!cancelled) {
          setStudents(
            studentIds.map((id) => {
              const p = profiles.find((prof) => prof.id === id);
              return { student_id: id, name: p?.full_name || p?.email || 'Student' };
            })
          );
        }
      }

      if (!cancelled) setPageLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, profile, router, supabase, classId, assignmentId]);

  const saved = useMemo(() => assignment?.questions_payload ?? [], [assignment]);
  const isDraft = assignment?.status === 'draft';
  const isEditing = drafts !== null;
  const questions = drafts ?? saved;

  const totalMarks = useMemo(() => questions.reduce((sum, q) => sum + (q.marks || 0), 0), [questions]);
  const attemptByStudent = useMemo(() => new Map(attempts.map((a) => [a.student_id, a])), [attempts]);
  const problems = useMemo(() => verifyQuestions(questions), [questions]);

  const completedScores = attempts
    .filter((a) => a.status === 'completed' && typeof a.percentage === 'number')
    .map((a) => a.percentage as number);
  const avgScore =
    completedScores.length > 0 ? Math.round(completedScores.reduce((sum, v) => sum + v, 0) / completedScores.length) : null;

  const toggleRevealed = (index: number) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const patchQuestion = (index: number, patch: Partial<ExamQuestion>) =>
    setDrafts((prev) => (prev ? prev.map((q, i) => (i === index ? { ...q, ...patch } : q)) : prev));

  const patchOption = (index: number, optionIndex: number, value: string) =>
    setDrafts((prev) =>
      prev
        ? prev.map((q, i) => {
            if (i !== index) return q;
            const options = [...q.options];
            while (options.length < OPTION_LETTERS.length) options.push('');
            options[optionIndex] = value;
            return { ...q, options };
          })
        : prev
    );

  const handleSave = async () => {
    if (!drafts) return;
    setActionError('');
    setIsSaving(true);
    const { error } = await supabase.from('assignments').update({ questions_payload: drafts }).eq('id', assignmentId);
    setIsSaving(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    setAssignment((prev) => (prev ? { ...prev, questions_payload: drafts } : prev));
    setDrafts(null);
    showToast('success', 'Changes saved.');
  };

  const handlePublish = async () => {
    setActionError('');
    setIsPublishing(true);
    const { data, error } = await supabase
      .from('assignments')
      .update({ status: 'published' })
      .eq('id', assignmentId)
      .select('status, published_at')
      .single();
    setIsPublishing(false);
    setConfirmingPublish(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    const row = data as { status: 'draft' | 'published'; published_at: string | null };
    setAssignment((prev) => (prev ? { ...prev, status: row.status, published_at: row.published_at } : prev));
    showToast('success', 'Published. Students can see it now.');
  };

  if (isLoading || pageLoading) {
    return <PageLoader text="Loading assignment..." />;
  }

  if (notFound || !assignment) {
    return (
      <PageHero
        icon={ClipboardList}
        title="Assignment not found"
        description="This assignment doesn&apos;t exist, or it isn&apos;t one of yours."
        backHref={`/dashboard/teacher/classes/${classId}`}
        backLabel="Back to class"
      />
    );
  }

  const meta = [
    className,
    assignment.assignment_type,
    assignment.topics?.name,
    assignment.due_date ? `due ${new Date(assignment.due_date).toLocaleDateString()}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-6">
      <PageHero
        icon={ClipboardList}
        title={assignment.title}
        description={meta}
        backHref={`/dashboard/teacher/classes/${classId}`}
        backLabel="Back to class"
        actions={
          isDraft ? (
            isEditing ? (
              <>
                <button type="button" onClick={() => setDrafts(null)} className={buttonStyles({ variant: 'secondary' })}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                  className={buttonStyles({ variant: 'primary' })}
                >
                  {isSaving ? 'Saving...' : 'Save changes'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setDrafts(structuredClone(saved))}
                  className={buttonStyles({ variant: 'secondary' })}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingPublish(true)}
                  disabled={problems.length > 0}
                  title={problems.length > 0 ? 'Fix the problems listed below first.' : undefined}
                  className={buttonStyles({ variant: 'primary' })}
                >
                  <Send className="h-4 w-4" />
                  Verify &amp; publish
                </button>
              </>
            )
          ) : null
        }
      />

      {isDraft ? (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <Pencil className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">Draft.</span> Your students can&apos;t see this yet. Check the questions and mark scheme,
            edit anything that&apos;s wrong, then publish. Publishing is permanent — once students can see it, it can&apos;t be edited.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">Published{assignment.published_at ? ` on ${new Date(assignment.published_at).toLocaleDateString()}` : ''}.</span>{' '}
            Students can see it, so the questions and mark scheme are locked.
          </p>
        </div>
      )}

      {isDraft && problems.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm dark:border-red-500/30 dark:bg-red-500/10">
          <p className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" />
            Fix {problems.length} thing{problems.length === 1 ? '' : 's'} before publishing
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-red-700 dark:text-red-300">
            {problems.map((problem, i) => (
              <li key={i}>
                {problem.questionIndex >= 0 ? `Q${problem.questionIndex + 1}: ` : ''}
                {problem.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirmingPublish && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/10">
          <p className="text-sm text-content">
            Publish <span className="font-semibold">{assignment.title}</span> to {students.length} student
            {students.length === 1 ? '' : 's'}? You won&apos;t be able to change the questions or mark scheme afterwards.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handlePublish()}
              disabled={isPublishing}
              className={buttonStyles({ variant: 'primary', size: 'sm' })}
            >
              {isPublishing ? 'Publishing...' : 'Yes, publish'}
            </button>
            <button type="button" onClick={() => setConfirmingPublish(false)} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}

      {assignment.description && <p className="text-sm text-content-muted">{assignment.description}</p>}

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Questions', value: String(questions.length) },
          { label: 'Total marks', value: String(totalMarks) },
          { label: 'Completed', value: `${completedScores.length}/${students.length}` },
          { label: 'Average score', value: avgScore === null ? '—' : `${avgScore}%` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-subtle bg-surface p-4 shadow-sm">
            <p className="text-xs text-content-subtle">{stat.label}</p>
            <p className="mt-1 text-lg font-semibold text-content">{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-content">Student progress</h2>
        {students.length === 0 ? (
          <p className="mt-4 text-sm text-content-subtle">No students in this class yet.</p>
        ) : (
          <div className="mt-4 space-y-1.5">
            {students.map((student) => {
              const attempt = attemptByStudent.get(student.student_id);
              const status = isDraft ? 'not published' : attempt?.status ?? 'not started';
              return (
                <div key={student.student_id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-content-muted dark:text-slate-300">{student.name}</span>
                  <span className="flex items-center gap-3 text-xs text-content-subtle">
                    <span className="capitalize">{status.replace('_', ' ')}</span>
                    {typeof attempt?.percentage === 'number' && (
                      <span className={`font-semibold ${scoreTextTone(attempt.percentage)}`}>{attempt.percentage}%</span>
                    )}
                    {attempt?.status === 'completed' && (
                      <Link
                        href={`/dashboard/teacher/classes/${classId}/assignments/${assignmentId}/students/${student.student_id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        View answers
                      </Link>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-content">Questions</h2>
        {questions.length === 0 ? (
          <p className="text-sm text-content-subtle">This assignment has no questions.</p>
        ) : (
          questions.map((question, index) => (
            <div key={index} className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-content-subtle">
                <span>Q{index + 1}</span>
                {isEditing ? (
                  <label className="flex items-center gap-1.5 normal-case tracking-normal">
                    <input
                      type="number"
                      min={1}
                      value={question.marks}
                      onChange={(e) => patchQuestion(index, { marks: Number(e.target.value) })}
                      className="w-16 rounded border border-subtle bg-surface px-2 py-0.5 text-sm text-content"
                    />
                    marks
                  </label>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-content-subtle dark:bg-surface/10">
                    {question.marks} mark{question.marks === 1 ? '' : 's'}
                  </span>
                )}
                {question.commandWord && !isEditing && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-content-subtle dark:bg-surface/10">{question.commandWord}</span>
                )}
              </div>

              {isEditing ? (
                <textarea
                  value={question.question}
                  onChange={(e) => patchQuestion(index, { question: e.target.value })}
                  rows={3}
                  className={`mt-2 ${inputClass}`}
                />
              ) : (
                <div className="mt-2 text-sm text-content-muted dark:text-slate-200">
                  <MathContent content={question.question} />
                </div>
              )}

              {question.questionType === 'mcq' &&
                (isEditing ? (
                  <div className="mt-3 space-y-2">
                    {OPTION_LETTERS.map((letter, optionIndex) => (
                      <label key={letter} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${index}`}
                          checked={question.correctOption === letter}
                          onChange={() => patchQuestion(index, { correctOption: letter })}
                        />
                        <span className="w-4 text-xs font-semibold text-content-subtle">{letter}</span>
                        <input
                          type="text"
                          value={question.options[optionIndex] ?? ''}
                          onChange={(e) => patchOption(index, optionIndex, e.target.value)}
                          className={inputClass}
                        />
                      </label>
                    ))}
                    <p className="text-xs text-content-subtle">Select the radio button next to the correct option. Leave unused options blank.</p>
                  </div>
                ) : (
                  question.options.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-content-muted">
                      {question.options.map((option, optionIndex) => (
                        <li
                          key={optionIndex}
                          className={
                            revealed.has(index) && OPTION_LETTERS[optionIndex] === question.correctOption
                              ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                              : ''
                          }
                        >
                          {OPTION_LETTERS[optionIndex]}. <MathContent content={option} inline />
                        </li>
                      ))}
                    </ul>
                  )
                ))}

              {question.questionType === 'plot' && question.plotSpec && (
                <div className="mt-3">
                  <PlotAnswerInput plotSpec={question.plotSpec} value="" onChange={() => {}} mode="review" studentSubmission={null} />
                </div>
              )}

              {question.questionType === 'diagram' && question.diagramSpec && (
                <div className="mt-3">
                  <DiagramAnswerInput
                    diagramSpec={question.diagramSpec}
                    diagramTemplate={question.diagramTemplate}
                    value=""
                    onChange={() => {}}
                    mode="review"
                    studentSubmission={null}
                  />
                </div>
              )}

              {isEditing ? (
                <div className="mt-3 space-y-3 rounded-lg border border-subtle bg-surface-sunken p-3 dark:bg-surface/3">
                  <div>
                    <label className={fieldLabelClass}>Mark scheme — one point per line</label>
                    <textarea
                      value={question.markScheme.join('\n')}
                      onChange={(e) => patchQuestion(index, { markScheme: e.target.value.split('\n') })}
                      rows={4}
                      className={`mt-1 ${inputClass}`}
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClass}>Model answer</label>
                    <textarea
                      value={question.modelAnswer}
                      onChange={(e) => patchQuestion(index, { modelAnswer: e.target.value })}
                      rows={3}
                      className={`mt-1 ${inputClass}`}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => toggleRevealed(index)} className="mt-3 text-xs font-medium text-accent hover:underline">
                    {revealed.has(index) ? 'Hide' : 'Show'} mark scheme
                  </button>
                  {revealed.has(index) && (
                    <div className="mt-2 rounded-lg border border-subtle bg-surface-sunken p-3 text-sm dark:bg-surface/3">
                      {question.markScheme.length > 0 && (
                        <ul className="list-disc space-y-1 pl-5 text-content-muted">
                          {question.markScheme.map((point, pointIndex) => (
                            <li key={pointIndex}>
                              <MathContent content={point} inline />
                            </li>
                          ))}
                        </ul>
                      )}
                      {question.modelAnswer && (
                        <div className="mt-2 text-content-muted dark:text-slate-300">
                          <span className="font-semibold">Model answer: </span>
                          <MathContent content={question.modelAnswer} inline />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
