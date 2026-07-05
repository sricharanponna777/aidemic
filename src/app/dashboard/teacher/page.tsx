'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Plus, Users } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { VerificationBanner } from '@/components/VerificationBanner';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
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

export default function TeacherDashboardPage() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const supabase = createClient();

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [schoolStatus, setSchoolStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

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
          'id, name, description, academic_year, invite_code, specifications ( name, tier, subjects ( name, exam_boards ( name, qualifications ( name ) ) ) ), class_students ( count )'
        )
        .eq('teacher_id', teacherRow.id)
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (classesError) {
        console.error('Failed to load classes:', classesError.message);
      } else {
        setClasses((classRows as unknown as ClassRow[]) ?? []);
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
          'id, name, description, academic_year, invite_code, specifications ( name, tier, subjects ( name, exam_boards ( name, qualifications ( name ) ) ) ), class_students ( count )'
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

  if (isLoading || classesLoading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading your classes...</p>;
  }

  return (
    <div className="space-y-6">
      <VerificationBanner verificationStatus={verificationStatus} schoolStatus={schoolStatus} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Classes</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Create classes, share invite codes, and set assignments.</p>
        </div>
        <button type="button" onClick={() => setShowCreateForm((v) => !v)} className={buttonStyles({ variant: 'primary' })}>
          <Plus className="h-4 w-4" />
          Create class
        </button>
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

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
          No classes yet. Create one to get started.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => {
            const subjectChain = cls.specifications?.subjects;
            const board = subjectChain?.exam_boards;
            const qualification = board?.qualifications;
            return (
              <Link
                key={cls.id}
                href={`/dashboard/teacher/classes/${cls.id}`}
                className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 dark:border-white/6 dark:bg-[#131B2E] dark:hover:border-indigo-500/40"
              >
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">{cls.name}</h3>
                <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {qualification ? <span>{qualification.name}</span> : null}
                  {board ? <span>· {board.name}</span> : null}
                  {subjectChain ? <span>· {subjectChain.name}</span> : null}
                </p>
                <div className="mt-3 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                  <Users className="h-4 w-4" />
                  {cls.class_students?.[0]?.count ?? 0} students
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/3">
                  <span className="font-mono text-sm font-semibold tracking-widest text-slate-800 dark:text-slate-100">
                    {cls.invite_code}
                  </span>
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
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
