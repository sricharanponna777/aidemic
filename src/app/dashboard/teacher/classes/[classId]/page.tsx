'use client';

import { useEffect, useMemo, useState } from 'react';
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
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { VerificationBanner } from '@/components/VerificationBanner';
import { PageLoader } from '@/components/PageLoader';
import { useToast } from '@/components/ToastProvider';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { scoreBarTone, scoreTextTone } from '@/lib/scoreTone';
import { AssignmentForm, type CreatedAssignment } from '@/components/teacher/AssignmentForm';
import { buildStudentStats, buildClassStats, buildTopicStats, buildAssignmentStats } from '@/lib/teacherAnalytics';
import { ParentLinksPanel } from '@/components/teacher/ParentLinksPanel';
import type { TeacherClass, TeacherAssignment, TeacherAttempt, TeacherStudent } from '@/hooks/useTeacherClassData';

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
};

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

type AttemptRow = {
  assignment_id: string;
  student_id: string;
  status: string;
  percentage: number | null;
  predicted_grade: string | null;
  completed_at: string | null;
  started_at: string | null;
};

export default function TeacherClassPage() {
  const { classId } = useParams<{ classId: string }>();
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const supabase = createClient();
  const { showToast } = useToast();

  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [schoolStatus, setSchoolStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [pendingDelete, setPendingDelete] = useState(false);
  const [selectedRosterIds, setSelectedRosterIds] = useState<Set<string>>(new Set());
  const [pendingRemoveSelected, setPendingRemoveSelected] = useState(false);
  const [expandedParentStudentId, setExpandedParentStudentId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);

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

      setRoster(
        typedRosterRows.map((r) => {
          const p = profiles.find((prof) => prof.id === r.student_id);
          return { id: r.id, student_id: r.student_id, joined_at: r.joined_at, full_name: p?.full_name ?? null, email: p?.email ?? null };
        })
      );

      const { data: assignmentRows } = await supabase
        .from('assignments')
        .select('id, title, assignment_type, due_date, created_at, topic_id, topics ( name ), assignment_attempts ( count )')
        .eq('class_id', classId)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      const assignmentList = (assignmentRows as unknown as AssignmentRow[]) ?? [];
      setAssignments(assignmentList);

      const assignmentIds = assignmentList.map((a) => a.id);
      if (assignmentIds.length > 0) {
        const { data: attemptRows } = await supabase
          .from('assignment_attempts')
          .select('assignment_id, student_id, status, percentage, predicted_grade, completed_at, started_at')
          .in('assignment_id', assignmentIds);
        if (!cancelled) setAttempts((attemptRows as AttemptRow[]) ?? []);
      }

      setPageLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, profile, router, supabase, classId]);

  const analyticsData = useMemo(() => {
    if (!classInfo) return null;
    const classesArr: TeacherClass[] = [{ id: classInfo.id, name: classInfo.name, status: classInfo.status, specifications: classInfo.specifications }];
    const studentsArr: TeacherStudent[] = roster.map((r) => ({
      id: r.id,
      student_id: r.student_id,
      class_id: classInfo.id,
      joined_at: r.joined_at,
      full_name: r.full_name,
      email: r.email,
    }));
    const assignmentsArr: TeacherAssignment[] = assignments.map((a) => ({
      id: a.id,
      title: a.title,
      class_id: classInfo.id,
      assignment_type: a.assignment_type,
      topic_id: a.topic_id,
      topics: a.topics,
      due_date: a.due_date,
      created_at: a.created_at,
    }));
    const attemptsArr: TeacherAttempt[] = attempts;
    return { classes: classesArr, assignments: assignmentsArr, attempts: attemptsArr, students: studentsArr };
  }, [classInfo, roster, assignments, attempts]);

  const studentStats = useMemo(() => (analyticsData ? buildStudentStats(analyticsData) : []), [analyticsData]);
  const studentStatsById = useMemo(() => new Map(studentStats.map((s) => [s.student_id, s])), [studentStats]);
  const classStat = useMemo(() => (analyticsData ? (buildClassStats(analyticsData)[0] ?? null) : null), [analyticsData]);
  const topicStats = useMemo(() => (analyticsData && classInfo ? buildTopicStats(analyticsData, classInfo.id) : []), [analyticsData, classInfo]);
  const assignmentStats = useMemo(() => (analyticsData ? buildAssignmentStats(analyticsData) : new Map()), [analyticsData]);

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
    if (!error) {
      setClassInfo({ ...classInfo, name: trimmed });
    } else {
      showToast('error', 'Failed to rename class. Please try again.');
    }
  };

  const handleToggleArchive = async () => {
    if (!classInfo) return;
    const nextStatus = classInfo.status === 'archived' ? 'active' : 'archived';
    const { error } = await supabase.from('classes').update({ status: nextStatus }).eq('id', classInfo.id);
    if (!error) {
      setClassInfo({ ...classInfo, status: nextStatus });
    } else {
      showToast('error', `Failed to ${nextStatus === 'archived' ? 'archive' : 'restore'} class. Please try again.`);
    }
  };

  const handleDeleteClass = async () => {
    if (!classInfo) return;
    const { error } = await supabase.from('classes').delete().eq('id', classInfo.id);
    if (!error) {
      router.replace('/dashboard/teacher/classes');
      return;
    }
    setPendingDelete(false);
    showToast('error', 'Failed to delete class. Please try again.');
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
    } else {
      showToast('error', 'Failed to remove selected students. Please try again.');
    }
  };

  const handleExportRoster = () => {
    const header = ['Name', 'Email', 'Joined', 'Completed', 'Total assignments', 'Avg score'];
    const rows = roster.map((r) => {
      const stats = studentStatsById.get(r.student_id);
      return [
        r.full_name ?? '',
        r.email ?? '',
        r.joined_at ? new Date(r.joined_at).toLocaleDateString() : '',
        String(stats?.completedCount ?? 0),
        String(assignments.length),
        stats?.avgScore == null ? '' : `${stats.avgScore}%`,
      ];
    });
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

  const handleAssignmentCreated = (row: CreatedAssignment) => {
    setAssignments((prev) => [row, ...prev]);
    setShowForm(false);
  };

  if (isLoading || pageLoading || !classInfo) {
    return <PageLoader text="Loading class..." />;
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
          { label: 'Completion', value: classStat?.completionRate == null ? '—' : `${classStat.completionRate}%`, icon: Target, from: 'from-amber-500', to: 'to-orange-500' },
          { label: 'Avg. score', value: classStat?.avgScore == null ? '—' : `${classStat.avgScore}%`, icon: Percent, from: 'from-indigo-500', to: 'to-purple-600' },
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

      {topicStats.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Topics needing attention</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Average score by topic across every assignment, weakest first.</p>
          <div className="mt-4 space-y-3">
            {topicStats.map((topic) => (
              <div key={topic.topic_id}>
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
              const stats = studentStatsById.get(student.student_id);
              const completedCount = stats?.completedCount ?? 0;
              const flagged = assignments.length > 0 && completedCount === 0;
              const isExpanded = expandedParentStudentId === student.student_id;
              return (
                <div key={student.student_id} className="rounded-lg border border-slate-200 dark:border-white/6">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
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
                      {assignments.length > 0 && <span>{completedCount}/{assignments.length} completed</span>}
                      {stats?.avgScore != null && <span className={`font-semibold ${scoreTextTone(stats.avgScore)}`}>{stats.avgScore}% avg</span>}
                      <span>{student.email}</span>
                      <button
                        type="button"
                        onClick={() => setExpandedParentStudentId(isExpanded ? null : student.student_id)}
                        className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Parent
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-slate-200 p-3 dark:border-white/6">
                      <ParentLinksPanel studentId={student.student_id} />
                    </div>
                  )}
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

        {showForm && teacherId && (
          <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-white/6">
            <AssignmentForm
              teacherId={teacherId}
              classes={[classInfo]}
              fixedClassId={classInfo.id}
              onCreated={handleAssignmentCreated}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {assignments.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No assignments yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {assignments.map((assignment) => {
              const analytics = assignmentStats.get(assignment.id);
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
                      <span>{analytics?.completedCount ?? 0}/{roster.length} completed</span>
                      {analytics?.avgScore != null && (
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
