'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { VerificationBanner } from '@/components/VerificationBanner';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { buildSpecString } from '@/lib/ai/subjectConfig';
import { normalizeBoard, normalizeExamType } from '@/lib/ai/validation';

const selectClass =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100';

type ClassInfo = {
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

type RosterRow = { student_id: string; joined_at: string | null; full_name: string | null; email: string | null };

type TopicOption = { id: string; name: string };
type LearningObjectiveOption = { id: string; objective: string };

type AssignmentRow = {
  id: string;
  title: string;
  assignment_type: string;
  due_date: string | null;
  created_at: string | null;
  assignment_attempts: { count: number }[];
};

export default function TeacherClassPage() {
  const { classId } = useParams<{ classId: string }>();
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const supabase = createClient();

  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [schoolStatus, setSchoolStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
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

      const { data: teacherRow } = await supabase
        .from('teachers')
        .select('id, verification_status, schools ( status )')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!teacherRow) {
        router.replace('/onboarding/teacher');
        return;
      }
      const typedTeacherRow = teacherRow as unknown as {
        id: string;
        verification_status: 'pending' | 'approved' | 'rejected';
        schools: { status: 'pending' | 'approved' | 'rejected' } | null;
      };
      setTeacherId(typedTeacherRow.id);
      setVerificationStatus(typedTeacherRow.verification_status);
      setSchoolStatus(typedTeacherRow.schools?.status ?? null);

      const { data: classRow, error: classError } = await supabase
        .from('classes')
        .select(
          'id, name, specification_id, specifications ( name, tier, subjects ( id, name, exam_boards ( name, qualifications ( name ) ) ) )'
        )
        .eq('id', classId)
        .eq('teacher_id', typedTeacherRow.id)
        .maybeSingle();

      if (cancelled) return;
      if (classError || !classRow) {
        router.replace('/dashboard/teacher');
        return;
      }
      setClassInfo(classRow as unknown as ClassInfo);

      const { data: rosterRows } = await supabase
        .from('class_students')
        .select('student_id, joined_at')
        .eq('class_id', classId)
        .eq('status', 'active');
      const typedRosterRows = (rosterRows ?? []) as { student_id: string; joined_at: string | null }[];
      const studentIds = typedRosterRows.map((r) => r.student_id);
      let profiles: { id: string; full_name: string | null; email: string | null }[] = [];
      if (studentIds.length > 0) {
        const { data: profileRows } = await supabase.from('user_profiles').select('id, full_name, email').in('id', studentIds);
        profiles = profileRows ?? [];
      }
      if (cancelled) return;
      setRoster(
        typedRosterRows.map((r) => {
          const p = profiles.find((prof) => prof.id === r.student_id);
          return { student_id: r.student_id, joined_at: r.joined_at, full_name: p?.full_name ?? null, email: p?.email ?? null };
        })
      );

      const { data: assignmentRows } = await supabase
        .from('assignments')
        .select('id, title, assignment_type, due_date, created_at, assignment_attempts ( count )')
        .eq('class_id', classId)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      setAssignments((assignmentRows as unknown as AssignmentRow[]) ?? []);

      const specificationId = (classRow as unknown as ClassInfo).specification_id;
      if (specificationId) {
        const { data: topicRows } = await supabase
          .from('topics')
          .select('id, name')
          .eq('specification_id', specificationId)
          .order('order_index', { ascending: true });
        if (!cancelled) setTopics((topicRows as TopicOption[]) ?? []);
      }

      const subjectId = (classRow as unknown as ClassInfo).specifications?.subjects?.id;
      if (subjectId) {
        const { data: objectiveRows } = await supabase
          .from('learning_objectives')
          .select('id, objective, applies_to')
          .eq('subject_id', subjectId)
          .contains('applies_to', ['exam_practice']);
        if (!cancelled) {
          setObjectives(((objectiveRows ?? []) as { id: string; objective: string }[]).map((o) => ({ id: o.id, objective: o.objective })));
        }
      }

      setPageLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, profile, router, supabase, classId]);

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

  const effectiveSubtopics = topicId ? subtopics : [];

  const resetForm = () => {
    setTopicId('');
    setSubtopicId('');
    setLearningObjectiveId('');
    setTitle('');
    setDescription('');
    setDueDate('');
    setQuestionCount(6);
  };

  const handleCreateAssignment = async () => {
    if (!teacherId || !classInfo) return;
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
        .select('id, title, assignment_type, due_date, created_at, assignment_attempts ( count )')
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

  if (isLoading || pageLoading || !classInfo) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading class...</p>;
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/teacher" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100">
        <ArrowLeft className="h-3.5 w-3.5" />
        My Classes
      </Link>

      <VerificationBanner verificationStatus={verificationStatus} schoolStatus={schoolStatus} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{classInfo.name}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{roster.length} student{roster.length === 1 ? '' : 's'}</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Roster</h2>
        {roster.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No students have joined yet. Share the invite code from My Classes.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {roster.map((student) => (
              <div key={student.student_id} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-2.5 text-sm dark:border-white/6">
                <span className="font-medium text-slate-900 dark:text-slate-100">{student.full_name || student.email || 'Student'}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{student.email}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Assignments</h2>
          <button type="button" onClick={() => setShowForm((v) => !v)} className={buttonStyles({ variant: 'primary', size: 'sm' })}>
            <Plus className="h-4 w-4" />
            Create assignment
          </button>
        </div>

        {showForm && (
          <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-white/6">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Phase 1 supports AI-generated practice assignments. Mock tests and flashcard assignments are coming soon.
            </p>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Topic</label>
                <select
                  value={topicId}
                  onChange={(e) => {
                    setTopicId(e.target.value);
                    setSubtopicId('');
                  }}
                  className={`${selectClass} w-full`}
                >
                  <option value="">Select topic</option>
                  {topics.map((t) => (
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
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Learning objective (optional)</label>
                <select value={learningObjectiveId} onChange={(e) => setLearningObjectiveId(e.target.value)} className={`${selectClass} w-full`}>
                  <option value="">None</option>
                  {objectives.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.objective}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Title (optional)</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={`${selectClass} w-full`} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Due date (optional)</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${selectClass} w-full`} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Description (optional)</label>
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
              <button type="button" onClick={() => setShowForm(false)} className={buttonStyles({ variant: 'secondary' })}>
                Cancel
              </button>
              <button type="button" onClick={handleCreateAssignment} disabled={isGenerating} className={buttonStyles({ variant: 'primary' })}>
                {isGenerating ? 'Generating questions...' : 'Generate & assign'}
              </button>
            </div>
          </div>
        )}

        {assignments.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No assignments yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-2.5 text-sm dark:border-white/6">
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{assignment.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                    {assignment.assignment_type}
                    {assignment.due_date ? ` · due ${new Date(assignment.due_date).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {assignment.assignment_attempts?.[0]?.count ?? 0}/{roster.length} completed
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
