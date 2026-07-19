'use client';

import { useEffect, useState } from 'react';
import { buttonStyles } from '@/components/ui/button';
import { createClient } from '@/lib/supabase-client';
import { buildSpecString } from '@/lib/ai/subjectConfig';
import { normalizeBoard, normalizeExamType } from '@/lib/ai/validation';

const selectClass =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100';

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
  teacherId: string;
  classes: AssignmentFormClass[];
  /** When set, the class is fixed (e.g. a class-detail page) and the class selector is hidden. */
  fixedClassId?: string;
  onCreated: (assignment: CreatedAssignment) => void;
  onCancel: () => void;
}

/** Shared "generate & assign practice questions" form used by the assignments list and class-detail pages. */
export function AssignmentForm({ teacherId, classes, fixedClassId, onCreated, onCancel }: AssignmentFormProps) {
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
    try {
      const response = await fetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.name,
          subtopic: subtopic?.name || '',
          learningObjective: objective?.objective || '',
          subject: subjectChain.name.toLowerCase(),
          examBoard,
          examType,
          specification: buildSpecString(classInfo.specifications?.name ?? '', classInfo.specifications?.tier ?? '', ''),
          questionCount,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setFormError(body.error || 'Failed to generate questions.');
        setIsGenerating(false);
        return;
      }

      const { data, error } = await supabase
        .from('assignments')
        .insert({
          class_id: classInfo.id,
          teacher_id: teacherId,
          title: title.trim() || `${topic.name}${subtopic ? ` - ${subtopic.name}` : ''}`,
          description: description.trim() || null,
          topic_id: topic.id,
          subtopic_id: subtopic?.id ?? null,
          learning_objective_id: objective?.id ?? null,
          assignment_type: 'practice',
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          questions_payload: body.questions,
          source_material: body.sourceMaterial || null,
          allow_reattempts: allowReattempts,
        })
        .select('id, title, assignment_type, due_date, created_at, class_id, topic_id, topics ( name ), assignment_attempts ( count ), allow_reattempts')
        .single();

      if (error) {
        setFormError(error.message);
        setIsGenerating(false);
        return;
      }

      onCreated(data as unknown as CreatedAssignment);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create assignment.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        AIDemic will write a set of practice questions for your students based on what you pick below. Mock tests and flashcard
        assignments are coming in a future update.
      </p>

      {!fixedClassId && (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">1. Which class?</p>
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

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {stepOffset + 1}. What should students practice?
      </p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Topic</label>
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
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Subtopic (optional)</label>
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
            className="text-xs font-medium text-slate-500 dark:text-slate-400"
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

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {stepOffset + 2}. Assignment details
      </p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Title (optional — we&apos;ll name it after the topic if left blank)
          </label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={`${selectClass} w-full`} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Due date (optional — schedules the assignment)</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${selectClass} w-full`} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Notes for students (optional)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={`${selectClass} w-full`} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Number of questions</label>
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

      <label className="mt-3 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
        <input
          type="checkbox"
          checked={allowReattempts}
          onChange={(e) => setAllowReattempts(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600"
        />
        Allow students to resubmit after marking
      </label>

      {formError ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{formError}</p> : null}

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
