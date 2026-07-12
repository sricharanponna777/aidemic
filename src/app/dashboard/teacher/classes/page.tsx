'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, AlertTriangle, Check, ClipboardList, Copy, GraduationCap, Pencil, Plus, Share2, Target, Trash2, Users, X } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { VerificationBanner } from '@/components/VerificationBanner';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { scoreBarTone, scoreTextTone } from '@/lib/scoreTone';
import {
  getExamBoardLabel,
  getSpecEntries,
  getSubjectLabel,
  requiresTierSelection,
  SELECTABLE_SUBJECTS,
  type ExamBoard,
  type SupportedSubject,
  type UserSubject,
} from '@/lib/ai/subjectConfig';
import { getQualificationConfig, getQualifications, type Country } from '@/lib/ai/countryConfig';
import { resolveSpecificationId } from '@/lib/ai/studentSubjects';

const selectClass =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100';

const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I/L)

function generateInviteCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => INVITE_CODE_CHARS[b % INVITE_CODE_CHARS.length]).join('');
}

type ClassRow = {
  id: string;
  name: string;
  description: string | null;
  academic_year: string | null;
  invite_code: string;
  status: 'active' | 'archived';
  specifications: {
    name: string;
    tier: string | null;
    subjects: {
      name: string;
      exam_boards: { name: string; qualifications: { name: string } | null } | null;
    } | null;
  } | null;
  class_students: { count: number }[];
};

type ClassAnalytics = {
  assignments: number;
  completionRate: number | null;
  avgScore: number | null;
};

export default function TeacherDashboardPage() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const supabase = createClient();

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [schoolStatus, setSchoolStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classAnalytics, setClassAnalytics] = useState<Record<string, ClassAnalytics>>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [qualId, setQualId] = useState('gcse');
  const [subject, setSubject] = useState<SupportedSubject>('biology');
  const [board, setBoard] = useState<ExamBoard>('aqa');
  const [specName, setSpecName] = useState('');
  const [specTier, setSpecTier] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const userCountry: Country = profile?.country ?? 'uk';
  const qualifications = getQualifications(userCountry);
  const effectiveQualId = qualifications.some((q) => q.id === qualId) ? qualId : qualifications[0]?.id ?? '';
  const qualConfig = getQualificationConfig(userCountry, effectiveQualId);
  const isComingSoon = qualConfig?.comingSoon ?? false;
  const examType = qualConfig?.examType ?? 'gcse';
  const boardOptions: ExamBoard[] = subject === 'english language' ? ['aqa'] : qualConfig?.boards ?? ['aqa', 'edexcel', 'ocr'];

  const pendingSubject: UserSubject = { id: 'new', subject, exam_board: board, exam_type: examType, spec_name: specName, spec_tier: specTier };
  const specEntries = getSpecEntries(pendingSubject);
  const effectiveSpecName = specEntries.length === 1 ? specEntries[0].name : specName;
  const selectedSpecEntry = specEntries.length === 1 ? specEntries[0] : specEntries.find((e) => e.name === specName) ?? null;
  const tierRequired = requiresTierSelection(pendingSubject, effectiveSpecName);

  useEffect(() => {
    if (isLoading) return;
    if (!session) return;
    if (profile && profile.role !== 'teacher') {
      router.replace('/dashboard');
      return;
    }

    let cancelled = false;
    const load = async () => {
      setClassesLoading(true);
      const { data: teacherRow, error: teacherError } = await supabase
        .from('teachers')
        .select('id, verification_status, schools ( status )')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (cancelled) return;
      if (teacherError || !teacherRow) {
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

      const { data: classRows, error: classesError } = await supabase
        .from('classes')
        .select(
          'id, name, description, academic_year, invite_code, status, specifications ( name, tier, subjects ( name, exam_boards ( name, qualifications ( name ) ) ) ), class_students ( count )'
        )
        .eq('teacher_id', teacherRow.id)
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (classesError) {
        console.error('Failed to load classes:', classesError.message);
      } else {
        setClasses((classRows as unknown as ClassRow[]) ?? []);
      }

      const typedClassRows = (classRows as unknown as ClassRow[]) ?? [];
      const classIds = typedClassRows.map((c) => c.id);
      if (classIds.length > 0) {
        const { data: assignmentRows } = await supabase.from('assignments').select('id, class_id').in('class_id', classIds);
        const assignmentList = (assignmentRows ?? []) as { id: string; class_id: string }[];
        const assignmentIds = assignmentList.map((a) => a.id);

        let attemptRows: { assignment_id: string; status: string; percentage: number | null }[] = [];
        if (assignmentIds.length > 0) {
          const { data } = await supabase.from('assignment_attempts').select('assignment_id, status, percentage').in('assignment_id', assignmentIds);
          attemptRows = (data ?? []) as typeof attemptRows;
        }

        const assignmentToClass = new Map(assignmentList.map((a) => [a.id, a.class_id]));
        const perClass = new Map<string, { assignments: number; completed: number; scores: number[] }>();
        for (const cls of typedClassRows) perClass.set(cls.id, { assignments: 0, completed: 0, scores: [] });
        for (const a of assignmentList) {
          const entry = perClass.get(a.class_id);
          if (entry) entry.assignments += 1;
        }
        for (const attempt of attemptRows) {
          const classId = assignmentToClass.get(attempt.assignment_id);
          const entry = classId ? perClass.get(classId) : undefined;
          if (!entry || attempt.status !== 'completed') continue;
          entry.completed += 1;
          if (typeof attempt.percentage === 'number') entry.scores.push(attempt.percentage);
        }

        const analytics: Record<string, ClassAnalytics> = {};
        for (const cls of typedClassRows) {
          const entry = perClass.get(cls.id)!;
          const rosterSize = cls.class_students?.[0]?.count ?? 0;
          const expected = entry.assignments * rosterSize;
          analytics[cls.id] = {
            assignments: entry.assignments,
            completionRate: expected > 0 ? Math.round((entry.completed / expected) * 100) : null,
            avgScore: entry.scores.length > 0 ? Math.round(entry.scores.reduce((sum, v) => sum + v, 0) / entry.scores.length) : null,
          };
        }
        if (!cancelled) setClassAnalytics(analytics);
      } else {
        setClassAnalytics({});
      }

      setClassesLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, profile, router, supabase]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setAcademicYear('');
    setSpecName('');
    setSpecTier('');
  };

  const handleCreateClass = async () => {
    if (!teacherId) return;
    setFormError('');
    if (!name.trim()) {
      setFormError('Give the class a name.');
      return;
    }
    if (specEntries.length > 1 && !effectiveSpecName) {
      setFormError('Choose the specification for this class.');
      return;
    }
    if (tierRequired && !specTier) {
      setFormError('Choose Foundation or Higher for this class.');
      return;
    }

    setIsSaving(true);
    const specificationId = await resolveSpecificationId(supabase, {
      qualificationLabel: qualConfig?.label ?? '',
      boardLabel: getExamBoardLabel(board),
      subjectLabel: getSubjectLabel(subject),
      specName: effectiveSpecName,
      specTier: specTier || null,
    });

    if (!specificationId) {
      setFormError('Could not find that specification in the curriculum database.');
      setIsSaving(false);
      return;
    }

    let lastError: { code?: string; message: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const inviteCode = generateInviteCode();
      const { data, error } = await supabase
        .from('classes')
        .insert({
          teacher_id: teacherId,
          name: name.trim(),
          description: description.trim() || null,
          academic_year: academicYear.trim() || null,
          specification_id: specificationId,
          invite_code: inviteCode,
        })
        .select(
          'id, name, description, academic_year, invite_code, status, specifications ( name, tier, subjects ( name, exam_boards ( name, qualifications ( name ) ) ) ), class_students ( count )'
        )
        .single();

      if (!error) {
        setClasses((prev) => [data as unknown as ClassRow, ...prev]);
        resetForm();
        setShowCreateForm(false);
        setIsSaving(false);
        return;
      }

      lastError = error;
      if (error.code !== '23505') break;
    }

    setFormError(lastError?.message || 'Failed to create class.');
    setIsSaving(false);
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard access can fail silently (e.g. insecure context); no-op.
    }
  };

  const handleRenameSave = async (classId: string) => {
    const trimmed = editingName.trim();
    setEditingClassId(null);
    if (!trimmed) return;
    const { error } = await supabase.from('classes').update({ name: trimmed }).eq('id', classId);
    if (!error) {
      setClasses((prev) => prev.map((c) => (c.id === classId ? { ...c, name: trimmed } : c)));
    }
  };

  const handleToggleArchive = async (cls: ClassRow) => {
    const nextStatus = cls.status === 'archived' ? 'active' : 'archived';
    const { error } = await supabase.from('classes').update({ status: nextStatus }).eq('id', cls.id);
    if (!error) {
      setClasses((prev) => prev.map((c) => (c.id === cls.id ? { ...c, status: nextStatus } : c)));
    }
  };

  const handleDeleteClass = async (classId: string) => {
    const { error } = await supabase.from('classes').delete().eq('id', classId);
    setPendingDeleteId(null);
    if (!error) {
      setClasses((prev) => prev.filter((c) => c.id !== classId));
    }
  };

  if (isLoading || classesLoading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading your classes...</p>;
  }

  const activeClasses = classes.filter((c) => c.status !== 'archived');
  const archivedClasses = classes.filter((c) => c.status === 'archived');
  const visibleClasses = showArchived ? classes : activeClasses;

  const studentsTotal = activeClasses.reduce((sum, c) => sum + (c.class_students?.[0]?.count ?? 0), 0);
  const analyticsValues = activeClasses.map((c) => classAnalytics[c.id]).filter((a): a is ClassAnalytics => !!a);
  const assignmentsTotal = analyticsValues.reduce((sum, a) => sum + a.assignments, 0);
  const completionRates = analyticsValues.map((a) => a.completionRate).filter((v): v is number => v !== null);
  const avgCompletion = completionRates.length > 0 ? Math.round(completionRates.reduce((sum, v) => sum + v, 0) / completionRates.length) : null;

  return (
    <div className="space-y-6">
      <VerificationBanner verificationStatus={verificationStatus} schoolStatus={schoolStatus} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Classes</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Each class gets a code your students use to join. Once they&apos;re in, you can set them AI-generated practice assignments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {archivedClasses.length > 0 && (
            <button type="button" onClick={() => setShowArchived((v) => !v)} className={buttonStyles({ variant: 'secondary' })}>
              <Archive className="h-4 w-4" />
              {showArchived ? 'Hide archived' : `Show archived (${archivedClasses.length})`}
            </button>
          )}
          <button type="button" onClick={() => setShowCreateForm((v) => !v)} className={buttonStyles({ variant: 'primary' })}>
            <Plus className="h-4 w-4" />
            Create class
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Classes', value: String(activeClasses.length), icon: GraduationCap, from: 'from-indigo-500', to: 'to-purple-600' },
          { label: 'Students', value: String(studentsTotal), icon: Users, from: 'from-blue-500', to: 'to-cyan-500' },
          { label: 'Assignments', value: String(assignmentsTotal), icon: ClipboardList, from: 'from-emerald-500', to: 'to-teal-500' },
          { label: 'Avg. completion', value: avgCompletion === null ? '—' : `${avgCompletion}%`, icon: Target, from: 'from-amber-500', to: 'to-orange-500' },
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

      {showCreateForm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Class name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Year 11 Biology"
                className={`${selectClass} w-full`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Academic year</label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="e.g. 2025/26"
                className={`${selectClass} w-full`}
              />
            </div>
          </div>

          <div className="mt-3 space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${selectClass} w-full`}
            />
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4 dark:border-white/6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">What will this class study?</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">This decides the exam board and specification AIDemic uses to generate practice questions.</p>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <label className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Qualification</label>
              <select
                value={effectiveQualId}
                onChange={(e) => {
                  setQualId(e.target.value);
                  setSpecName('');
                  setSpecTier('');
                }}
                className={selectClass}
              >
                {qualifications.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.label}
                  </option>
                ))}
              </select>
            </div>
            {!isComingSoon && (
              <>
                <div className="flex items-center gap-2">
                  <label className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Exam Board</label>
                  <select
                    value={board}
                    onChange={(e) => {
                      setBoard(e.target.value as ExamBoard);
                      setSpecName('');
                      setSpecTier('');
                    }}
                    className={selectClass}
                  >
                    {boardOptions.map((b) => (
                      <option key={b} value={b}>
                        {getExamBoardLabel(b)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">Subject</label>
                  <select
                    value={subject}
                    onChange={(e) => {
                      const next = e.target.value as SupportedSubject;
                      setSubject(next);
                      if (next === 'english language') setBoard('aqa');
                      setSpecName('');
                      setSpecTier('');
                    }}
                    className={selectClass}
                  >
                    {SELECTABLE_SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {getSubjectLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {isComingSoon ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300">
              {qualConfig?.label} support is coming soon.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {specEntries.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
                  No specification options for this combination.
                </div>
              ) : specEntries.length === 1 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-white/6 dark:bg-white/3 dark:text-slate-300">
                  {specEntries[0].name}
                </div>
              ) : (
                <select
                  value={specName}
                  onChange={(e) => {
                    setSpecName(e.target.value);
                    setSpecTier('');
                  }}
                  className={selectClass}
                >
                  <option value="">Select specification</option>
                  {specEntries.map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              )}
              {selectedSpecEntry?.tiers?.length ? (
                <select value={specTier} onChange={(e) => setSpecTier(e.target.value)} className={selectClass}>
                  <option value="">Tier</option>
                  {selectedSpecEntry.tiers.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          )}

          {formError ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{formError}</p> : null}

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreateForm(false)} className={buttonStyles({ variant: 'secondary' })}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateClass}
              disabled={isSaving || isComingSoon || specEntries.length === 0}
              className={buttonStyles({ variant: 'primary' })}
            >
              {isSaving ? 'Creating...' : 'Create class'}
            </button>
          </div>
        </div>
      )}

      {classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 dark:border-white/10 dark:bg-white/3">
          <p className="text-center text-sm font-medium text-slate-700 dark:text-slate-300">You haven&apos;t created a class yet. Here&apos;s how it works:</p>
          <ol className="mx-auto mt-4 max-w-md space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">1</span>
              Click &quot;Create class&quot; and pick the subject and exam board your students study.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">2</span>
              Share the class&apos;s invite code with your students.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">3</span>
              Students enter the code on their end to join the class.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">4</span>
              Open the class and create assignments — AIDemic generates the practice questions for you.
            </li>
          </ol>
        </div>
      ) : visibleClasses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/3 dark:text-slate-400">
          All your classes are archived.{' '}
          <button type="button" onClick={() => setShowArchived(true)} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Show archived
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleClasses.map((cls) => {
            const subjectChain = cls.specifications?.subjects;
            const board = subjectChain?.exam_boards;
            const qualification = board?.qualifications;
            const analytics = classAnalytics[cls.id];
            const needsAttention = analytics?.completionRate !== null && analytics?.completionRate !== undefined && analytics.completionRate < 40;
            const isArchived = cls.status === 'archived';
            const isEditing = editingClassId === cls.id;
            const isPendingDelete = pendingDeleteId === cls.id;
            return (
              <Link
                key={cls.id}
                href={`/dashboard/teacher/classes/${cls.id}`}
                className={`block rounded-2xl border p-5 shadow-sm transition ${
                  isArchived
                    ? 'border-dashed border-slate-300 bg-slate-50 opacity-70 hover:border-slate-400 dark:border-white/10 dark:bg-white/3'
                    : 'border-slate-200 bg-white hover:border-indigo-300 dark:border-white/6 dark:bg-[#131B2E] dark:hover:border-indigo-500/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  {isEditing ? (
                    <div className="flex flex-1 items-center gap-1.5" onClick={(e) => e.preventDefault()}>
                      <input
                        autoFocus
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleRenameSave(cls.id);
                          if (e.key === 'Escape') setEditingClassId(null);
                        }}
                        className="w-full rounded-md border border-indigo-300 bg-white px-2 py-1 text-sm font-semibold text-slate-900 outline-none dark:border-indigo-500/50 dark:bg-[#0A0F1E] dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          void handleRenameSave(cls.id);
                        }}
                        className="shrink-0 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                        aria-label="Save name"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setEditingClassId(null);
                        }}
                        className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        aria-label="Cancel rename"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">{cls.name}</h3>
                  )}
                  {!isEditing && needsAttention && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                      <AlertTriangle className="h-3 w-3" />
                      Needs attention
                    </span>
                  )}
                </div>
                <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {qualification ? <span>{qualification.name}</span> : null}
                  {board ? <span>· {board.name}</span> : null}
                  {subjectChain ? <span>· {subjectChain.name}</span> : null}
                </p>
                <div className="mt-3 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                  <Users className="h-4 w-4" />
                  {cls.class_students?.[0]?.count ?? 0} students
                </div>

                {analytics && analytics.assignments > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Completion</span>
                      <span className={`font-semibold ${scoreTextTone(analytics.completionRate)}`}>{analytics.completionRate ?? 0}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                      <div
                        className={`h-full rounded-full ${scoreBarTone(analytics.completionRate)}`}
                        style={{ width: `${analytics.completionRate ?? 0}%` }}
                      />
                    </div>
                    {analytics.avgScore !== null && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Avg score: <span className={`font-semibold ${scoreTextTone(analytics.avgScore)}`}>{analytics.avgScore}%</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">No assignments yet</p>
                )}

                <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/3">
                  <div>
                    <p className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <Share2 className="h-3 w-3" />
                      Invite code
                    </p>
                    <span className="font-mono text-sm font-semibold tracking-widest text-slate-800 dark:text-slate-100">
                      {cls.invite_code}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      void handleCopyCode(cls.invite_code);
                    }}
                    className="text-slate-400 transition hover:text-indigo-500"
                    aria-label="Copy invite code"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>

                {isPendingDelete ? (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/30">
                    <p className="text-xs text-red-700 dark:text-red-300">Delete this class and all its data?</p>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setPendingDeleteId(null);
                        }}
                        className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          void handleDeleteClass(cls.id);
                        }}
                        className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setEditingClassId(cls.id);
                        setEditingName(cls.name);
                      }}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
                    >
                      <Pencil className="h-3 w-3" />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        void handleToggleArchive(cls);
                      }}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
                    >
                      {isArchived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
                      {isArchived ? 'Unarchive' : 'Archive'}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setPendingDeleteId(cls.id);
                      }}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
