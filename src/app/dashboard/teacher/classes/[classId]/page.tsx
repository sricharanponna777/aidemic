'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  ClipboardList,
  Copy,
  Download,
  Pencil,
  Percent,
  Plus,
  Share2,
  Target,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { VerificationBanner } from '@/components/VerificationBanner';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { buildSpecString } from '@/lib/ai/subjectConfig';
import { normalizeBoard, normalizeExamType } from '@/lib/ai/validation';
import { scoreBarTone, scoreTextTone } from '@/lib/scoreTone';

const selectClass =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100';

type ClassInfo = {
  id: string;
  name: string;
  invite_code: string;
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

type RosterRow = {
  id: string;
  student_id: string;
  joined_at: string | null;
  full_name: string | null;
  email: string | null;
  completedCount: number;
  avgScore: number | null;
};

type TopicOption = { id: string; name: string };
type LearningObjectiveOption = { id: string; objective: string };

type AssignmentRow = {
  id: string;
  title: string;
  assignment_type: string;
  due_date: string | null;
  created_at: string | null;
  topic_id: string | null;
  topics: { name: string } | null;
  assignment_attempts: { count: number }[];
};

type PercentStat = { completionRate: number | null; avgScore: number | null };
type TopicStat = PercentStat & { id: string; name: string };

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
  const [classStats, setClassStats] = useState<PercentStat>({ completionRate: null, avgScore: null });
  const [assignmentAnalytics, setAssignmentAnalytics] = useState<Record<string, PercentStat>>({});
  const [topicAnalytics, setTopicAnalytics] = useState<TopicStat[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [pendingDelete, setPendingDelete] = useState(false);
  const [selectedRosterIds, setSelectedRosterIds] = useState<Set<string>>(new Set());
  const [pendingRemoveSelected, setPendingRemoveSelected] = useState(false);

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
          'id, name, invite_code, status, specification_id, specifications ( name, tier, subjects ( id, name, exam_boards ( name, qualifications ( name ) ) ) )'
        )
        .eq('id', classId)
        .eq('teacher_id', typedTeacherRow.id)
        .maybeSingle();

      if (cancelled) return;
      if (classError || !classRow) {
        router.replace('/dashboard/teacher/classes');
        return;
      }
      setClassInfo(classRow as unknown as ClassInfo);

      const { data: rosterRows } = await supabase
        .from('class_students')
        .select('id, student_id, joined_at')
        .eq('class_id', classId)
        .eq('status', 'active');
      const typedRosterRows = (rosterRows ?? []) as { id: string; student_id: string; joined_at: string | null }[];
      const studentIds = typedRosterRows.map((r) => r.student_id);
      let profiles: { id: string; full_name: string | null; email: string | null }[] = [];
      if (studentIds.length > 0) {
        const { data: profileRows } = await supabase.from('user_profiles').select('id, full_name, email').in('id', studentIds);
        profiles = profileRows ?? [];
      }
      if (cancelled) return;

      const { data: assignmentRows } = await supabase
        .from('assignments')
        .select('id, title, assignment_type, due_date, created_at, topic_id, topics ( name ), assignment_attempts ( count )')
        .eq('class_id', classId)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      const assignmentList = (assignmentRows as unknown as AssignmentRow[]) ?? [];
      setAssignments(assignmentList);

      const assignmentIds = assignmentList.map((a) => a.id);
      let attemptRows: { assignment_id: string; student_id: string; status: string; percentage: number | null }[] = [];
      if (assignmentIds.length > 0) {
        const { data } = await supabase
          .from('assignment_attempts')
          .select('assignment_id, student_id, status, percentage')
          .in('assignment_id', assignmentIds);
        attemptRows = (data ?? []) as typeof attemptRows;
      }
      if (cancelled) return;

      const rosterSize = typedRosterRows.length;
      const perStudent = new Map<string, { completed: number; scores: number[] }>();
      const perAssignment = new Map<string, { completed: number; scores: number[] }>();
      for (const attempt of attemptRows) {
        if (attempt.status !== 'completed') continue;
        const studentEntry = perStudent.get(attempt.student_id) ?? { completed: 0, scores: [] };
        studentEntry.completed += 1;
        if (typeof attempt.percentage === 'number') studentEntry.scores.push(attempt.percentage);
        perStudent.set(attempt.student_id, studentEntry);

        const assignmentEntry = perAssignment.get(attempt.assignment_id) ?? { completed: 0, scores: [] };
        assignmentEntry.completed += 1;
        if (typeof attempt.percentage === 'number') assignmentEntry.scores.push(attempt.percentage);
        perAssignment.set(attempt.assignment_id, assignmentEntry);
      }
      const average = (values: number[]) => (values.length > 0 ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : null);

      setAssignmentAnalytics(
        Object.fromEntries(
          assignmentList.map((a) => {
            const entry = perAssignment.get(a.id);
            return [
              a.id,
              {
                completionRate: rosterSize > 0 ? Math.round(((entry?.completed ?? 0) / rosterSize) * 100) : null,
                avgScore: average(entry?.scores ?? []),
              },
            ];
          })
        )
      );

      const perTopic = new Map<string, { name: string; completed: number; expected: number; scores: number[] }>();
      for (const a of assignmentList) {
        const topicKey = a.topic_id ?? 'none';
        const entry = perTopic.get(topicKey) ?? { name: a.topics?.name ?? 'General', completed: 0, expected: 0, scores: [] };
        entry.expected += rosterSize;
        const assignmentEntry = perAssignment.get(a.id);
        entry.completed += assignmentEntry?.completed ?? 0;
        if (assignmentEntry) entry.scores.push(...assignmentEntry.scores);
        perTopic.set(topicKey, entry);
      }
      setTopicAnalytics(
        [...perTopic.entries()].map(([id, entry]) => ({
          id,
          name: entry.name,
          completionRate: entry.expected > 0 ? Math.round((entry.completed / entry.expected) * 100) : null,
          avgScore: average(entry.scores),
        }))
      );

      const totalCompleted = attemptRows.filter((a) => a.status === 'completed').length;
      const expectedTotal = assignmentList.length * rosterSize;
      setClassStats({
        completionRate: expectedTotal > 0 ? Math.round((totalCompleted / expectedTotal) * 100) : null,
        avgScore: average(attemptRows.filter((a) => a.status === 'completed' && typeof a.percentage === 'number').map((a) => a.percentage as number)),
      });

      setRoster(
        typedRosterRows.map((r) => {
          const p = profiles.find((prof) => prof.id === r.student_id);
          const stats = perStudent.get(r.student_id);
          return {
            id: r.id,
            student_id: r.student_id,
            joined_at: r.joined_at,
            full_name: p?.full_name ?? null,
            email: p?.email ?? null,
            completedCount: stats?.completed ?? 0,
            avgScore: average(stats?.scores ?? []),
          };
        })
      );

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

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard access can fail silently (e.g. insecure context); no-op.
    }
  };

  const handleRenameSave = async () => {
    if (!classInfo) return;
    const trimmed = editingName.trim();
    setIsEditingName(false);
    if (!trimmed || trimmed === classInfo.name) return;
    const { error } = await supabase.from('classes').update({ name: trimmed }).eq('id', classInfo.id);
    if (!error) setClassInfo({ ...classInfo, name: trimmed });
  };

  const handleToggleArchive = async () => {
    if (!classInfo) return;
    const nextStatus = classInfo.status === 'archived' ? 'active' : 'archived';
    const { error } = await supabase.from('classes').update({ status: nextStatus }).eq('id', classInfo.id);
    if (!error) setClassInfo({ ...classInfo, status: nextStatus });
  };

  const handleDeleteClass = async () => {
    if (!classInfo) return;
    const { error } = await supabase.from('classes').delete().eq('id', classInfo.id);
    if (!error) {
      router.replace('/dashboard/teacher/classes');
      return;
    }
    setPendingDelete(false);
  };

  const toggleRosterSelection = (rowId: string) => {
    setSelectedRosterIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleSelectAllRoster = () => {
    setSelectedRosterIds((prev) => (prev.size === roster.length ? new Set() : new Set(roster.map((r) => r.id))));
  };

  const handleRemoveSelected = async () => {
    const ids = [...selectedRosterIds];
    setPendingRemoveSelected(false);
    if (ids.length === 0) return;
    const { error } = await supabase.from('class_students').update({ status: 'inactive' }).in('id', ids);
    if (!error) {
      setRoster((prev) => prev.filter((r) => !selectedRosterIds.has(r.id)));
      setSelectedRosterIds(new Set());
    }
  };

  const handleExportRoster = () => {
    const header = ['Name', 'Email', 'Joined', 'Completed', 'Total assignments', 'Avg score'];
    const rows = roster.map((r) => [
      r.full_name ?? '',
      r.email ?? '',
      r.joined_at ? new Date(r.joined_at).toLocaleDateString() : '',
      String(r.completedCount),
      String(assignments.length),
      r.avgScore === null ? '' : `${r.avgScore}%`,
    ]);
    const escapeCsv = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${classInfo?.name || 'class'}-roster.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        .select('id, title, assignment_type, due_date, created_at, topic_id, topics ( name ), assignment_attempts ( count )')
        .single();

      if (error) {
        setFormError(error.message);
        setIsGenerating(false);
        return;
      }

      const newAssignment = data as unknown as AssignmentRow;
      setAssignments((prev) => [newAssignment, ...prev]);
      setAssignmentAnalytics((prev) => ({ ...prev, [newAssignment.id]: { completionRate: roster.length > 0 ? 0 : null, avgScore: null } }));
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
      <Link href="/dashboard/teacher/classes" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100">
        <ArrowLeft className="h-3.5 w-3.5" />
        My Classes
      </Link>

      <VerificationBanner verificationStatus={verificationStatus} schoolStatus={schoolStatus} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {isEditingName ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleRenameSave();
                  if (e.key === 'Escape') setIsEditingName(false);
                }}
                className="rounded-md border border-indigo-300 bg-white px-2 py-1 text-xl font-bold text-slate-900 outline-none dark:border-indigo-500/50 dark:bg-[#0A0F1E] dark:text-white"
              />
              <button type="button" onClick={() => void handleRenameSave()} aria-label="Save name" className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400">
                <Check className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setIsEditingName(false)} aria-label="Cancel rename" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{classInfo.name}</h1>
              <button
                type="button"
                onClick={() => {
                  setIsEditingName(true);
                  setEditingName(classInfo.name);
                }}
                aria-label="Rename class"
                className="text-slate-400 hover:text-indigo-500"
              >
                <Pencil className="h-4 w-4" />
              </button>
              {classInfo.status === 'archived' && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">
                  Archived
                </span>
              )}
            </div>
          )}
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{roster.length} student{roster.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-white/6 dark:bg-[#131B2E]">
            <div>
              <p className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <Share2 className="h-3 w-3" />
                Invite code — share with students
              </p>
              <span className="font-mono text-sm font-semibold tracking-widest text-slate-800 dark:text-slate-100">
                {classInfo.invite_code}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleCopyCode(classInfo.invite_code)}
              className="text-slate-400 transition hover:text-indigo-500"
              aria-label="Copy invite code"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <button type="button" onClick={() => void handleToggleArchive()} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
            {classInfo.status === 'archived' ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {classInfo.status === 'archived' ? 'Unarchive' : 'Archive'}
          </button>
          <button type="button" onClick={() => setPendingDelete(true)} className={buttonStyles({ variant: 'danger-ghost', size: 'sm' })}>
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {pendingDelete && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/30">
          <p className="text-sm text-red-700 dark:text-red-300">Delete this class, its roster, and all its assignments? This can&apos;t be undone.</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setPendingDelete(false)} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
              Cancel
            </button>
            <button type="button" onClick={() => void handleDeleteClass()} className={buttonStyles({ variant: 'danger', size: 'sm' })}>
              Delete class
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Students', value: String(roster.length), icon: Users, from: 'from-blue-500', to: 'to-cyan-500' },
          { label: 'Assignments', value: String(assignments.length), icon: ClipboardList, from: 'from-emerald-500', to: 'to-teal-500' },
          { label: 'Completion', value: classStats.completionRate === null ? '—' : `${classStats.completionRate}%`, icon: Target, from: 'from-amber-500', to: 'to-orange-500' },
          { label: 'Avg. score', value: classStats.avgScore === null ? '—' : `${classStats.avgScore}%`, icon: Percent, from: 'from-indigo-500', to: 'to-purple-600' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]"
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${stat.from} ${stat.to} shadow-md`}>
              <stat.icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {topicAnalytics.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Topics needing attention</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Average score by topic across every assignment, weakest first.</p>
          <div className="mt-4 space-y-3">
            {[...topicAnalytics]
              .sort((a, b) => (a.avgScore ?? 101) - (b.avgScore ?? 101))
              .map((topic) => (
                <div key={topic.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{topic.name}</span>
                    <span className={`font-semibold ${scoreTextTone(topic.avgScore)}`}>
                      {topic.avgScore === null ? 'No completed attempts yet' : `${topic.avgScore}% avg`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div className={`h-full rounded-full ${scoreBarTone(topic.avgScore)}`} style={{ width: `${topic.avgScore ?? 0}%` }} />
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Roster</h2>
          {roster.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {selectedRosterIds.size > 0 &&
                (pendingRemoveSelected ? (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 dark:border-red-900/40 dark:bg-red-950/30">
                    <p className="text-xs text-red-700 dark:text-red-300">Remove {selectedRosterIds.size} student{selectedRosterIds.size === 1 ? '' : 's'}?</p>
                    <button type="button" onClick={() => setPendingRemoveSelected(false)} className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                      Cancel
                    </button>
                    <button type="button" onClick={() => void handleRemoveSelected()} className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400">
                      Remove
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setPendingRemoveSelected(true)} className={buttonStyles({ variant: 'danger-ghost', size: 'sm' })}>
                    <Trash2 className="h-4 w-4" />
                    Remove {selectedRosterIds.size} selected
                  </button>
                ))}
              <button type="button" onClick={handleExportRoster} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
                <Download className="h-4 w-4" />
                Export roster
              </button>
            </div>
          )}
        </div>
        {roster.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No students have joined yet. Share the invite code above — students enter it when they set up their account.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 px-4 text-xs text-slate-500 dark:text-slate-400">
              <input
                type="checkbox"
                checked={selectedRosterIds.size === roster.length}
                onChange={toggleSelectAllRoster}
                className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600"
              />
              Select all
            </label>
            {roster.map((student) => {
              const flagged = assignments.length > 0 && student.completedCount === 0;
              return (
                <div key={student.student_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm dark:border-white/6">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedRosterIds.has(student.id)}
                      onChange={() => toggleRosterSelection(student.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="font-medium text-slate-900 dark:text-slate-100">{student.full_name || student.email || 'Student'}</span>
                    {flagged && (
                      <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                        <AlertTriangle className="h-3 w-3" />
                        Needs attention
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    {assignments.length > 0 && <span>{student.completedCount}/{assignments.length} completed</span>}
                    {student.avgScore !== null && <span className={`font-semibold ${scoreTextTone(student.avgScore)}`}>{student.avgScore}% avg</span>}
                    <span>{student.email}</span>
                  </div>
                </div>
              );
            })}
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
            <p className="text-sm text-slate-600 dark:text-slate-400">
              AIDemic will write a set of practice questions for your students based on what you pick below. Mock tests and flashcard
              assignments are coming in a future update.
            </p>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              1. What should students practice?
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
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400" title="Narrows the questions to one specific exam skill within the topic.">
                  Focus on a specific skill (optional)
                </label>
                <select value={learningObjectiveId} onChange={(e) => setLearningObjectiveId(e.target.value)} className={`${selectClass} w-full`}>
                  <option value="">No specific focus — cover the whole topic</option>
                  {objectives.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.objective}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">2. Assignment details</p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Title (optional — we&apos;ll name it after the topic if left blank)</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={`${selectClass} w-full`} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Due date (optional)</label>
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
            {assignments.map((assignment) => {
              const analytics = assignmentAnalytics[assignment.id];
              return (
                <div key={assignment.id} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm dark:border-white/6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{assignment.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                        {assignment.assignment_type}
                        {assignment.topics?.name ? ` · ${assignment.topics.name}` : ''}
                        {assignment.due_date ? ` · due ${new Date(assignment.due_date).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>{assignment.assignment_attempts?.[0]?.count ?? 0}/{roster.length} completed</span>
                      {analytics?.avgScore !== null && analytics?.avgScore !== undefined && (
                        <span className={`font-semibold ${scoreTextTone(analytics.avgScore)}`}>{analytics.avgScore}% avg</span>
                      )}
                    </div>
                  </div>
                  {analytics && analytics.completionRate !== null && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                      <div className={`h-full rounded-full ${scoreBarTone(analytics.completionRate)}`} style={{ width: `${analytics.completionRate}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
