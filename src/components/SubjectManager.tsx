'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import {
  buildSpecString,
  getExamBoardLabel,
  getSpecEntries,
  getSubjectLabel,
  requiresTierSelection,
  SELECTABLE_SUBJECTS,
  type ExamBoard,
  type UserSubject,
  type SupportedSubject,
} from '@/lib/ai/subjectConfig';
import {
  COUNTRIES,
  COUNTRY_LABELS,
  getQualificationConfig,
  getQualifications,
  type Country,
} from '@/lib/ai/countryConfig';

const isMissingSubjectSpecColumns = (error: { code?: string; message?: string } | null) => {
  const message = error?.message?.toLowerCase() ?? '';
  return error?.code === '42703' || message.includes('spec_name') || message.includes('spec_tier');
};

const selectClass =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100';

export function SubjectManager() {
  const { session } = useAuth();
  const supabase = createClient();
  const [subjects, setSubjects] = useState<UserSubject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [newCountry, setNewCountry] = useState<Country>('uk');
  const [newQualId, setNewQualId] = useState('gcse');
  const [newSubject, setNewSubject] = useState<SupportedSubject>('biology');
  const [newBoard, setNewBoard] = useState<ExamBoard>('aqa');
  const [newSpecName, setNewSpecName] = useState('');
  const [newSpecTier, setNewSpecTier] = useState('');
  const [subjectSaving, setSubjectSaving] = useState(false);
  const [subjectError, setSubjectError] = useState('');

  const qualifications = getQualifications(newCountry);
  const qualConfig = getQualificationConfig(newCountry, newQualId);
  const isComingSoon = qualConfig?.comingSoon ?? false;
  const newType = qualConfig?.examType ?? 'gcse';
  const boardOptions: ExamBoard[] =
    newSubject === 'english language' ? ['aqa'] : (qualConfig?.boards ?? ['aqa', 'edexcel', 'ocr']);

  const pendingSubject: UserSubject = {
    id: 'new',
    subject: newSubject,
    exam_board: newBoard,
    exam_type: newType,
    spec_name: newSpecName,
    spec_tier: newSpecTier,
  };
  const specEntries = getSpecEntries(pendingSubject);
  const effectiveSpecName = specEntries.length === 1 ? specEntries[0].name : newSpecName;
  const selectedSpecEntry =
    specEntries.length === 1 ? specEntries[0] : specEntries.find((e) => e.name === newSpecName) ?? null;
  const tierRequired = requiresTierSelection(pendingSubject, effectiveSpecName);
  const selectedSpecLabel = buildSpecString(effectiveSpecName, newSpecTier, '');

  useEffect(() => {
    if (!session?.user?.id) return;
    let isMounted = true;

    const load = async () => {
      setSubjectsLoading(true);
      const { data, error } = await supabase
        .from('user_subjects')
        .select('id, subject, exam_board, exam_type, spec_name, spec_tier')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true });

      if (!isMounted) return;
      if (error && isMissingSubjectSpecColumns(error)) {
        const { data: fallbackData } = await supabase
          .from('user_subjects')
          .select('id, subject, exam_board, exam_type')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: true });
        setSubjects(
          ((fallbackData as UserSubject[]) ?? []).map((s) => ({ ...s, spec_name: null, spec_tier: null })),
        );
        setSubjectError('Run the latest Supabase migration before saving subject specs and tiers.');
      } else if (error) {
        console.error('Failed to load user subjects', error);
        setSubjectError('Could not load your saved subjects.');
      } else {
        setSubjects((data as UserSubject[]) ?? []);
      }
      setSubjectsLoading(false);
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [session?.user?.id, supabase]);

  const handleAddSubject = async () => {
    if (!session?.user?.id) return;
    setSubjectError('');
    if (specEntries.length > 1 && !effectiveSpecName) {
      setSubjectError('Choose the specification for this subject.');
      return;
    }
    if (tierRequired && !newSpecTier) {
      setSubjectError('Choose Foundation or Higher for this subject.');
      return;
    }
    const duplicate = subjects.some(
      (s) =>
        s.subject === newSubject &&
        s.exam_board === newBoard &&
        s.exam_type === newType &&
        (s.spec_name ?? '') === effectiveSpecName &&
        (s.spec_tier ?? '') === newSpecTier,
    );
    if (duplicate) {
      setSubjectError('That subject is already in your list.');
      return;
    }

    setSubjectSaving(true);
    const { data, error } = await supabase
      .from('user_subjects')
      .insert({
        user_id: session.user.id,
        subject: newSubject,
        exam_board: newBoard,
        exam_type: newType,
        spec_name: effectiveSpecName || null,
        spec_tier: newSpecTier || null,
      })
      .select('id, subject, exam_board, exam_type, spec_name, spec_tier')
      .single();

    if (error) {
      setSubjectError(
        isMissingSubjectSpecColumns(error)
          ? 'Run the latest Supabase migration before saving subject specs and tiers.'
          : 'Failed to save subject.',
      );
    } else {
      setSubjects((prev) => [...prev, data as UserSubject]);
      setNewSpecName('');
      setNewSpecTier('');
    }
    setSubjectSaving(false);
  };

  const handleRemoveSubject = async (id: string) => {
    await supabase.from('user_subjects').delete().eq('id', id);
    setSubjects((prev) => prev.filter((s) => s.id !== id));
  };

  const resetSubjectFields = () => {
    setNewSubject('biology');
    setNewBoard('aqa');
    setNewSpecName('');
    setNewSpecTier('');
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E] dark:shadow-none">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Your subjects</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Save the exact qualifications you study so AI content matches your course.
        </p>
      </div>

      <div className="mt-5 space-y-2">
        {subjectsLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading subjects...</p>
        ) : subjects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
            No subjects added yet.
          </p>
        ) : (
          subjects.map((subject) => (
            <div
              key={subject.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-2.5 dark:border-white/6"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {getSubjectLabel(subject.subject)}
                </span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-indigo-500/15 dark:text-blue-300">
                  {getExamBoardLabel(subject.exam_board)}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {subject.exam_type === 'a-level' ? 'A-Level' : 'GCSE'}
                </span>
                {buildSpecString(subject.spec_name ?? '', subject.spec_tier ?? '', '') ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    {buildSpecString(subject.spec_name ?? '', subject.spec_tier ?? '', '')}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => handleRemoveSubject(subject.id)}
                className="text-slate-400 transition hover:text-red-500 dark:hover:text-red-400"
                aria-label="Remove subject"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Country + Qualification */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Country</label>
          <select
            value={newCountry}
            onChange={(event) => {
              const country = event.target.value as Country;
              const firstQual = getQualifications(country)[0];
              setNewCountry(country);
              setNewQualId(firstQual?.id ?? '');
              resetSubjectFields();
            }}
            className={selectClass}
          >
            {COUNTRIES.map((country) => (
              <option key={country} value={country}>
                {COUNTRY_LABELS[country]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Qualification</label>
          <select
            value={newQualId}
            onChange={(event) => {
              setNewQualId(event.target.value);
              resetSubjectFields();
            }}
            className={selectClass}
          >
            {qualifications.map((qual) => (
              <option key={qual.id} value={qual.id}>
                {qual.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isComingSoon ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300">
          {qualConfig?.label} support is coming soon — stay tuned.
        </p>
      ) : (
        <>
          {/* Exam Board + Subject */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Exam Board</label>
              <select
                value={newBoard}
                onChange={(event) => {
                  setNewBoard(event.target.value as ExamBoard);
                  setNewSpecName('');
                  setNewSpecTier('');
                }}
                className={selectClass}
              >
                {boardOptions.map((board) => (
                  <option key={board} value={board}>
                    {getExamBoardLabel(board)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Subject</label>
              <select
                value={newSubject}
                onChange={(event) => {
                  const next = event.target.value as SupportedSubject;
                  setNewSubject(next);
                  if (next === 'english language') setNewBoard('aqa');
                  setNewSpecName('');
                  setNewSpecTier('');
                }}
                className={selectClass}
              >
                {SELECTABLE_SUBJECTS.map((subject) => (
                  <option key={subject} value={subject}>
                    {getSubjectLabel(subject)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Specification + Tier + Add */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
            {specEntries.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
                No specification options available for this combination.
              </div>
            ) : specEntries.length === 1 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-white/6 dark:bg-white/3 dark:text-slate-300">
                {specEntries[0].name}
              </div>
            ) : (
              <select
                value={newSpecName}
                onChange={(event) => {
                  setNewSpecName(event.target.value);
                  setNewSpecTier('');
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
              <select
                value={newSpecTier}
                onChange={(event) => setNewSpecTier(event.target.value)}
                className={selectClass}
              >
                <option value="">Tier</option>
                {selectedSpecEntry.tiers.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={handleAddSubject}
              disabled={subjectSaving || specEntries.length === 0}
              className={buttonStyles({ variant: 'primary' })}
            >
              <Plus className="h-4 w-4" />
              {subjectSaving ? 'Adding...' : 'Add'}
            </button>
          </div>

          {selectedSpecLabel ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              AI generation will use {selectedSpecLabel}.
            </p>
          ) : null}
        </>
      )}

      {subjectError ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{subjectError}</p>
      ) : null}
    </div>
  );
}
