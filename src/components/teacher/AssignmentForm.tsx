'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { createClient } from '@/lib/supabase-client';
import { buildSpecString } from '@/lib/ai/subjectConfig';
import { normalizeBoard, normalizeExamType } from '@/lib/ai/validation';

const selectClass =
  'rounded-lg border border-subtle px-3 py-2 text-sm outline-none focus:border-accent bg-surface text-content';

/**
 * Generation runs as a background job and reports which stage it is on. Showing
 * the stage rather than one indefinite spinner is the whole point: the pipeline
 * takes over a minute, and "Generating..." for 74 seconds is indistinguishable
 * from a frozen page.
 */
type JobStatus =
  | 'queued'
  | 'validating'
  | 'generating'
  | 'backfilling'
  | 'finalising'
  | 'saving'
  | 'completed'
  | 'failed';

const STAGE_ORDER: JobStatus[] = ['queued', 'validating', 'generating', 'backfilling', 'finalising', 'saving'];

const STAGE_LABEL: Record<JobStatus, string> = {
  queued: 'Starting up',
  validating: 'Checking the topic against the specification',
  generating: 'Writing questions',
  backfilling: 'Filling gaps in the question set',
  finalising: 'Checking the question set over',
  saving: 'Saving the assignment',
  completed: 'Done',
  failed: 'Failed',
};

/** Backfill only runs when the first pass came up short, so it may be skipped. */
const POLL_INTERVAL_MS = 2000;
/** Generous: generation has been measured at ~74s and can retry internally. */
const JOB_TIMEOUT_MS = 5 * 60 * 1000;
/**
 * A job whose stage has not moved in this long is treated as dead.
 *
 * Generation runs inside the request's own invocation (`after()`), so if the
 * platform terminates that invocation — the route is pinned at Vercel's 300s
 * ceiling, with no headroom — nothing is left to write `failed` and the row sits
 * in `generating` forever. Without this the teacher watches a spinner for the
 * full five minutes and is then told, wrongly, that it is still running.
 *
 * Comfortably longer than the slowest single stage: generation itself is the
 * long one at ~74s, and it updates the row on entry and exit.
 */
const STALE_AFTER_MS = 3 * 60 * 1000;

type JobRow = {
  id: string;
  status: JobStatus;
  assignment_id: string | null;
  error: string | null;
  updated_at: string;
};

export type AssignmentFormClass = {
  id: string;
  name: string;
  specification_id: string | null;
  specifications: {
    name: string;
    tier: string | null;
    subjects: {
      id: string;
      name: string;
      exam_boards: { name: string; qualifications: { name: string } | null } | null;
    } | null;
  } | null;
};

export type CreatedAssignment = {
  id: string;
  title: string;
  assignment_type: string;
  due_date: string | null;
  created_at: string | null;
  class_id: string;
  topic_id: string | null;
  topics: { name: string } | null;
  assignment_attempts: { count: number }[];
  allow_reattempts: boolean;
};

type TopicOption = { id: string; name: string };
type LearningObjectiveOption = { id: string; objective: string };

interface AssignmentFormProps {
  classes: AssignmentFormClass[];
  /** When set, the class is fixed (e.g. a class-detail page) and the class selector is hidden. */
  fixedClassId?: string;
  onCreated: (assignment: CreatedAssignment) => void;
  onCancel: () => void;
}

/** Shared "generate & assign practice questions" form used by the assignments list and class-detail pages. */
export function AssignmentForm({ classes, fixedClassId, onCreated, onCancel }: AssignmentFormProps) {
  const supabase = createClient();
  const stepOffset = fixedClassId ? 0 : 1;

  const [selectedClassId, setSelectedClassId] = useState(fixedClassId ?? '');
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [subtopics, setSubtopics] = useState<TopicOption[]>([]);
  const [objectives, setObjectives] = useState<LearningObjectiveOption[]>([]);
  const [topicId, setTopicId] = useState('');
  const [subtopicId, setSubtopicId] = useState('');
  const [learningObjectiveId, setLearningObjectiveId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [questionCount, setQuestionCount] = useState(6);
  const [allowReattempts, setAllowReattempts] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [formError, setFormError] = useState('');

  const classInfo = classes.find((c) => c.id === selectedClassId) ?? null;

  useEffect(() => {
    if (!selectedClassId) return;
    let cancelled = false;
    const load = async () => {
      if (classInfo?.specification_id) {
        const { data } = await supabase
          .from('topics')
          .select('id, name')
          .eq('specification_id', classInfo.specification_id)
          .order('order_index', { ascending: true });
        if (!cancelled) setTopics((data as TopicOption[]) ?? []);
      }
      const subjectId = classInfo?.specifications?.subjects?.id;
      if (subjectId) {
        const { data } = await supabase
          .from('learning_objectives')
          .select('id, objective, applies_to')
          .eq('subject_id', subjectId)
          .contains('applies_to', ['exam_practice']);
        if (!cancelled) {
          setObjectives(((data ?? []) as { id: string; objective: string }[]).map((o) => ({ id: o.id, objective: o.objective })));
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, supabase]);

  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from('subtopics').select('id, name').eq('topic_id', topicId).order('order_index', { ascending: true });
      if (!cancelled) setSubtopics((data as TopicOption[]) ?? []);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [topicId, supabase]);

  const effectiveTopics = selectedClassId ? topics : [];
  const effectiveObjectives = selectedClassId ? objectives : [];
  const effectiveSubtopics = topicId ? subtopics : [];

  /**
   * Poll the job row until it settles. Returns null on timeout, which is not the
   * same as failure — the job is still running server-side, and the assignment
   * will appear on its own.
   */
  const pollJob = async (jobId: string): Promise<JobRow | null> => {
    const deadline = Date.now() + JOB_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const { data } = await supabase
        .from('assignment_generation_jobs')
        .select('id, status, assignment_id, error, updated_at')
        .eq('id', jobId)
        .maybeSingle();
      const row = data as JobRow | null;
      if (!row) continue;
      setJobStatus(row.status);
      if (row.status === 'completed' || row.status === 'failed') return row;

      // Nothing is left running to mark this failed, so say so rather than
      // spinning until the timeout and implying it is still going.
      const sinceUpdate = Date.now() - new Date(row.updated_at).getTime();
      if (Number.isFinite(sinceUpdate) && sinceUpdate > STALE_AFTER_MS) {
        return {
          ...row,
          status: 'failed',
          error: 'Generation stopped partway through and did not finish. Nothing was saved — please try again.',
        };
      }
    }
    return null;
  };

  const handleCreateAssignment = async () => {
    if (!classInfo) {
      setFormError('Choose a class for this assignment.');
      return;
    }
    setFormError('');

    const topic = topics.find((t) => t.id === topicId);
    if (!topic) {
      setFormError('Choose a topic for this assignment.');
      return;
    }
    const subtopic = subtopics.find((s) => s.id === subtopicId);
    const objective = objectives.find((o) => o.id === learningObjectiveId);
    const subjectChain = classInfo.specifications?.subjects;
    const board = subjectChain?.exam_boards;
    const qualification = board?.qualifications;
    if (!subjectChain || !board || !qualification) {
      setFormError('This class is missing curriculum details.');
      return;
    }

    const examBoard = normalizeBoard(board.name);
    const examType = normalizeExamType(qualification.name);
    if (!examBoard || !examType) {
      setFormError('Could not resolve this class exam board/type.');
      return;
    }

    setIsGenerating(true);
    setJobStatus('queued');
    try {
      // The server writes the assignment itself once generation finishes, so a
      // teacher who closes this tab still gets the assignment.
      const response = await fetch('/api/assignments/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: classInfo.id,
          topicId: topic.id,
          subtopicId: subtopic?.id ?? '',
          learningObjectiveId: objective?.id ?? '',
          title: title.trim() || `${topic.name}${subtopic ? ` - ${subtopic.name}` : ''}`,
          description: description.trim(),
          dueDate,
          allowReattempts,
          generation: {
            topic: topic.name,
            subtopic: subtopic?.name || '',
            learningObjective: objective?.objective || '',
            subject: subjectChain.name.toLowerCase(),
            examBoard,
            examType,
            specification: buildSpecString(classInfo.specifications?.name ?? '', classInfo.specifications?.tier ?? '', ''),
            questionCount,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setFormError(body.error || 'Failed to start generation.');
        setIsGenerating(false);
        setJobStatus(null);
        return;
      }

      const job = await pollJob(body.jobId as string);
      if (!job) {
        setFormError('Generation is taking longer than expected. It is still running — reload this page shortly to see the assignment.');
        setIsGenerating(false);
        setJobStatus(null);
        return;
      }
      if (job.status === 'failed' || !job.assignment_id) {
        setFormError(job.error || 'Failed to generate questions.');
        setIsGenerating(false);
        setJobStatus(null);
        return;
      }

      const { data, error } = await supabase
        .from('assignments')
        .select('id, title, assignment_type, due_date, created_at, class_id, topic_id, topics ( name ), assignment_attempts ( count ), allow_reattempts')
        .eq('id', job.assignment_id)
        .single();

      if (error) {
        setFormError(error.message);
        setIsGenerating(false);
        setJobStatus(null);
        return;
      }

      onCreated(data as unknown as CreatedAssignment);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create assignment.');
    } finally {
      setIsGenerating(false);
      setJobStatus(null);
    }
  };

  return (
    <>
      <p className="text-sm text-content-muted">
        AIDemic will write a set of practice questions for your students based on what you pick below. Mock tests and flashcard
        assignments are coming in a future update.
      </p>

      {!fixedClassId && (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-content-subtle">1. Which class?</p>
          <div className="mt-2">
            <select
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setTopicId('');
                setSubtopicId('');
                setLearningObjectiveId('');
              }}
              className={`${selectClass} w-full sm:w-auto`}
            >
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-content-subtle">
        {stepOffset + 1}. What should students practice?
      </p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-content-subtle">Topic</label>
          <select
            value={topicId}
            onChange={(e) => {
              setTopicId(e.target.value);
              setSubtopicId('');
            }}
            disabled={!selectedClassId}
            className={`${selectClass} w-full`}
          >
            <option value="">Select topic</option>
            {effectiveTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-content-subtle">Subtopic (optional)</label>
          <select
            value={subtopicId}
            onChange={(e) => setSubtopicId(e.target.value)}
            disabled={!topicId || effectiveSubtopics.length === 0}
            className={`${selectClass} w-full`}
          >
            <option value="">Whole topic</option>
            {effectiveSubtopics.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label
            className="text-xs font-medium text-content-subtle"
            title="Narrows the questions to one specific exam skill within the topic."
          >
            Focus on a specific skill (optional)
          </label>
          <select
            value={learningObjectiveId}
            onChange={(e) => setLearningObjectiveId(e.target.value)}
            disabled={!selectedClassId}
            className={`${selectClass} w-full`}
          >
            <option value="">No specific focus — cover the whole topic</option>
            {effectiveObjectives.map((o) => (
              <option key={o.id} value={o.id}>
                {o.objective}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-content-subtle">
        {stepOffset + 2}. Assignment details
      </p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-content-subtle">
            Title (optional — we&apos;ll name it after the topic if left blank)
          </label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={`${selectClass} w-full`} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-content-subtle">Due date (optional — schedules the assignment)</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${selectClass} w-full`} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-content-subtle">Notes for students (optional)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={`${selectClass} w-full`} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-content-subtle">Number of questions</label>
          <input
            type="number"
            min={1}
            max={20}
            value={questionCount}
            onChange={(e) => setQuestionCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
            className={`${selectClass} w-full`}
          />
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-content-muted">
        <input
          type="checkbox"
          checked={allowReattempts}
          onChange={(e) => setAllowReattempts(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-subtle"
        />
        Allow students to resubmit after marking
      </label>

      {formError ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{formError}</p> : null}

      {jobStatus ? (
        <div className="mt-4 rounded-xl border border-subtle bg-surface-sunken p-4 dark:bg-surface/3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            <p className="text-sm font-medium text-content">{STAGE_LABEL[jobStatus]}</p>
          </div>
          <ol className="mt-3 space-y-1.5">
            {STAGE_ORDER.map((stage, index) => {
              const currentIndex = STAGE_ORDER.indexOf(jobStatus);
              // A stage can be skipped (backfill only runs on a short first
              // pass), so "done" is by position rather than by having been seen.
              const done = currentIndex > index;
              const active = currentIndex === index;
              return (
                <li
                  key={stage}
                  className={`flex items-center gap-2 text-xs ${
                    active ? 'font-semibold text-content' : done ? 'text-content-muted' : 'text-content-subtle'
                  }`}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-accent' : 'bg-slate-300 dark:bg-white/20'}`} />
                  )}
                  {STAGE_LABEL[stage]}
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-content-subtle">
            This usually takes about a minute. You can leave this page — the assignment will be waiting for you.
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonStyles({ variant: 'secondary' })}>
          Cancel
        </button>
        <button type="button" onClick={() => void handleCreateAssignment()} disabled={isGenerating} className={buttonStyles({ variant: 'primary' })}>
          {isGenerating ? 'Generating questions...' : 'Generate & assign'}
        </button>
      </div>
    </>
  );
}
