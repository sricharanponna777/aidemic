'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ClipboardList, Plus } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { buildSpecString } from '@/lib/ai/subjectConfig';
import { normalizeBoard, normalizeExamType } from '@/lib/ai/validation';
import { scoreBarTone, scoreTextTone } from '@/lib/scoreTone';

const selectClass =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100';

type ClassOption = {
  id: string;
  name: string;
  status: 'active' | 'archived';
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

type TopicOption = { id: string; name: string };
type LearningObjectiveOption = { id: string; objective: string };

type AssignmentRow = {
  id: string;
  title: string;
  assignment_type: string;
  due_date: string | null;
  created_at: string | null;
  class_id: string;
  topic_id: string | null;
  topics: { name: string } | null;
};

type AttemptRow = { assignment_id: string; student_id: string; status: string; percentage: number | null };
type RosterRow = { id: string; student_id: string; class_id: string; full_name: string | null; email: string | null };

export default function TeacherAssignmentsPage() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const supabase = createClient();

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);

  const [filterClassId, setFilterClassId] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [formError, setFormError] = useState('');

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
      const typedTeacherId = (teacherRow as { id: string }).id;
      setTeacherId(typedTeacherId);

      const { data: classRows } = await supabase
        .from('classes')
        .select(
          'id, name, status, specification_id, specifications ( name, tier, subjects ( id, name, exam_boards ( name, qualifications ( name ) ) ) )'
        )
        .eq('teacher_id', typedTeacherId)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      const classList = (classRows as unknown as ClassOption[]) ?? [];
      setClasses(classList);

      const classIds = classList.map((c) => c.id);
      if (classIds.length === 0) {
        setPageLoading(false);
        return;
      }

      const { data: assignmentRows } = await supabase
        .from('assignments')
        .select('id, title, assignment_type, due_date, created_at, class_id, topic_id, topics ( name )')
        .in('class_id', classIds)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      const assignmentList = (assignmentRows as unknown as AssignmentRow[]) ?? [];
      setAssignments(assignmentList);

      const assignmentIds = assignmentList.map((a) => a.id);
      if (assignmentIds.length > 0) {
        const { data: attemptRows } = await supabase
          .from('assignment_attempts')
          .select('assignment_id, student_id, status, percentage')
          .in('assignment_id', assignmentIds);
        if (!cancelled) setAttempts((attemptRows as AttemptRow[]) ?? []);
      }

      const { data: rosterRows } = await supabase
        .from('class_students')
        .select('id, student_id, class_id')
        .in('class_id', classIds)
        .eq('status', 'active');
      const typedRosterRows = (rosterRows ?? []) as { id: string; student_id: string; class_id: string }[];
      const studentIds = [...new Set(typedRosterRows.map((r) => r.student_id))];
      let profiles: { id: string; full_name: string | null; email: string | null }[] = [];
      if (studentIds.length > 0) {
        const { data: profileRows } = await supabase.from('user_profiles').select('id, full_name, email').in('id', studentIds);
        profiles = profileRows ?? [];
      }
      if (!cancelled) {
        setRoster(
          typedRosterRows.map((r) => {
            const p = profiles.find((prof) => prof.id === r.student_id);
            return { id: r.id, student_id: r.student_id, class_id: r.class_id, full_name: p?.full_name ?? null, email: p?.email ?? null };
          })
        );
      }

      setPageLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, profile, router, supabase]);

  useEffect(() => {
    if (!selectedClassId) return;
    const cls = classes.find((c) => c.id === selectedClassId);
    if (!cls) return;

    let cancelled = false;
    const load = async () => {
      if (cls.specification_id) {
        const { data } = await supabase
          .from('topics')
          .select('id, name')
          .eq('specification_id', cls.specification_id)
          .order('order_index', { ascending: true });
        if (!cancelled) setTopics((data as TopicOption[]) ?? []);
      }
      const subjectId = cls.specifications?.subjects?.id;
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
  }, [selectedClassId, classes, supabase]);

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

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const rosterByClass = useMemo(() => {
    const map = new Map<string, RosterRow[]>();
    for (const r of roster) {
      const entry = map.get(r.class_id) ?? [];
      entry.push(r);
      map.set(r.class_id, entry);
    }
    return map;
  }, [roster]);
  const attemptsByAssignment = useMemo(() => {
    const map = new Map<string, AttemptRow[]>();
    for (const a of attempts) {
      const entry = map.get(a.assignment_id) ?? [];
      entry.push(a);
      map.set(a.assignment_id, entry);
    }
    return map;
  }, [attempts]);

  const average = (values: number[]) => (values.length > 0 ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : null);

  const assignmentStats = useMemo(() => {
    const stats = new Map<string, { completionRate: number | null; avgScore: number | null; completed: number; rosterSize: number }>();
    for (const a of assignments) {
      const rosterSize = rosterByClass.get(a.class_id)?.length ?? 0;
      const classAttempts = (attemptsByAssignment.get(a.id) ?? []).filter((att) => att.status === 'completed');
      stats.set(a.id, {
        completionRate: rosterSize > 0 ? Math.round((classAttempts.length / rosterSize) * 100) : null,
        avgScore: average(classAttempts.filter((att) => typeof att.percentage === 'number').map((att) => att.percentage as number)),
        completed: classAttempts.length,
        rosterSize,
      });
    }
    return stats;
  }, [assignments, rosterByClass, attemptsByAssignment]);

  const visibleAssignments = filterClassId === 'all' ? assignments : assignments.filter((a) => a.class_id === filterClassId);
  const effectiveTopics = selectedClassId ? topics : [];
  const effectiveObjectives = selectedClassId ? objectives : [];
  const effectiveSubtopics = topicId ? subtopics : [];
  const activeClasses = classes.filter((c) => c.status !== 'archived');

  const resetForm = () => {
    setSelectedClassId('');
    setTopicId('');
    setSubtopicId('');
    setLearningObjectiveId('');
    setTitle('');
    setDescription('');
    setDueDate('');
    setQuestionCount(6);
    setFormError('');
  };

  const handleCreateAssignment = async () => {
    const classInfo = classes.find((c) => c.id === selectedClassId);
    if (!teacherId || !classInfo) {
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
        })
        .select('id, title, assignment_type, due_date, created_at, class_id, topic_id, topics ( name )')
        .single();

      if (error) {
        setFormError(error.message);
        setIsGenerating(false);
        return;
      }

      setAssignments((prev) => [data as unknown as AssignmentRow, ...prev]);
      resetForm();
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create assignment.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading || pageLoading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading assignments...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Assignments</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Create, schedule, and review assignments across all your classes.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          disabled={activeClasses.length === 0}
          className={buttonStyles({ variant: 'primary' })}
        >
          <Plus className="h-4 w-4" />
          Create assignment
        </button>
      </div>

      {classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/3 dark:text-slate-400">
          You need a class before you can create assignments.{' '}
          <Link href="/dashboard/teacher/classes" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Create a class
          </Link>
        </div>
      ) : (
        <>
          {showForm && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                AIDemic will write a set of practice questions for your students based on what you pick below. Mock tests and flashcard
                assignments are coming in a future update.
              </p>

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
                  {activeClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                2. What should students practice?
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
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400" title="Narrows the questions to one specific exam skill within the topic.">
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

              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">3. Assignment details</p>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Title (optional — we&apos;ll name it after the topic if left blank)</label>
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

              {formError ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{formError}</p> : null}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowForm(false);
                  }}
                  className={buttonStyles({ variant: 'secondary' })}
                >
                  Cancel
                </button>
                <button type="button" onClick={handleCreateAssignment} disabled={isGenerating} className={buttonStyles({ variant: 'primary' })}>
                  {isGenerating ? 'Generating questions...' : 'Generate & assign'}
                </button>
              </div>
            </div>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">All assignments</h2>
              {classes.length > 1 && (
                <select value={filterClassId} onChange={(e) => setFilterClassId(e.target.value)} className={selectClass}>
                  <option value="all">All classes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {visibleAssignments.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No assignments yet.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {visibleAssignments.map((assignment) => {
                  const stats = assignmentStats.get(assignment.id);
                  const cls = classById.get(assignment.class_id);
                  const isExpanded = expandedId === assignment.id;
                  const classRoster = rosterByClass.get(assignment.class_id) ?? [];
                  const classAttempts = attemptsByAssignment.get(assignment.id) ?? [];
                  return (
                    <div key={assignment.id} className="rounded-lg border border-slate-200 dark:border-white/6">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : assignment.id)}
                        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left text-sm"
                      >
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">{assignment.title}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                            {cls?.name ?? 'Unknown class'}
                            {assignment.topics?.name ? ` · ${assignment.topics.name}` : ''}
                            {assignment.due_date ? ` · due ${new Date(assignment.due_date).toLocaleDateString()}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            {stats?.completed ?? 0}/{stats?.rosterSize ?? 0} completed
                          </span>
                          {stats?.avgScore !== null && stats?.avgScore !== undefined && (
                            <span className={`font-semibold ${scoreTextTone(stats.avgScore)}`}>{stats.avgScore}% avg</span>
                          )}
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </button>
                      {stats && stats.completionRate !== null && (
                        <div className="mx-4 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                          <div className={`h-full rounded-full ${scoreBarTone(stats.completionRate)}`} style={{ width: `${stats.completionRate}%` }} />
                        </div>
                      )}
                      {isExpanded && (
                        <div className="border-t border-slate-200 px-4 py-3 dark:border-white/6">
                          {classRoster.length === 0 ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400">No students in this class yet.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {classRoster.map((student) => {
                                const attempt = classAttempts.find((a) => a.student_id === student.student_id);
                                const status = attempt?.status ?? 'not started';
                                return (
                                  <div key={student.id} className="flex items-center justify-between text-xs">
                                    <span className="text-slate-700 dark:text-slate-300">{student.full_name || student.email || 'Student'}</span>
                                    <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                      <span className="capitalize">{status.replace('_', ' ')}</span>
                                      {typeof attempt?.percentage === 'number' && (
                                        <span className={`font-semibold ${scoreTextTone(attempt.percentage)}`}>{attempt.percentage}%</span>
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {classes.length > 0 && assignments.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:bg-white/3 dark:text-slate-400">
          <ClipboardList className="h-4 w-4 shrink-0" />
          Create your first assignment above — AIDemic generates the practice questions for you.
        </div>
      )}
    </div>
  );
}
