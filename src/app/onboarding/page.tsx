'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Brain, CheckCircle2, Layers, LogOut, Plus, Target, Trash2, Zap } from 'lucide-react';
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
  type SupportedSubject,
  type UserSubject,
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

const appSteps = [
  {
    title: 'Learn',
    text: 'Create specification-aware notes for the exact course you are studying.',
    icon: BookOpen,
  },
  {
    title: 'Flashcards',
    text: 'Turn topics into recall decks that match your board and qualification.',
    icon: Layers,
  },
  {
    title: 'Flashcard Revision',
    text: 'Review cards in focused sessions and keep track of what needs practice.',
    icon: Brain,
  },
  {
    title: 'Smart Practice',
    text: 'Answer exam-style questions, get marks, and build predicted grade evidence.',
    icon: Target,
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const { session, isLoading } = useAuth();
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
  const selectedSpecEntry = specEntries.length === 1
    ? specEntries[0]
    : specEntries.find((entry) => entry.name === newSpecName) ?? null;
  const tierRequired = requiresTierSelection(pendingSubject, effectiveSpecName);
  const selectedSpecLabel = buildSpecString(effectiveSpecName, newSpecTier, '');

  const resetSubjectFields = () => {
    setNewSubject('biology');
    setNewBoard('aqa');
    setNewSpecName('');
    setNewSpecTier('');
  };

  useEffect(() => {
    if (!session?.user?.id) return;

    let isMounted = true;
    const loadSubjects = async () => {
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
        setSubjects(((fallbackData as UserSubject[]) ?? []).map((subject) => ({
          ...subject,
          spec_name: null,
          spec_tier: null,
        })));
        setSubjectError('Run the latest Supabase migration before saving subject specs and tiers.');
      } else if (error) {
        console.error('Failed to load onboarding subjects', error);
        setSubjectError('Could not load your saved subjects.');
      } else {
        setSubjects((data as UserSubject[]) ?? []);
      }
      setSubjectsLoading(false);
    };

    void loadSubjects();
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
      (subject) =>
        subject.subject === newSubject &&
        subject.exam_board === newBoard &&
        subject.exam_type === newType &&
        (subject.spec_name ?? '') === effectiveSpecName &&
        (subject.spec_tier ?? '') === newSpecTier
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
          : 'Failed to save subject.'
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
    setSubjects((prev) => prev.filter((subject) => subject.id !== id));
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (isLoading || subjectsLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef2fb] dark:bg-[#0A0F1E]">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-500" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-purple-500 [animation-delay:0.15s]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:0.3s]" />
        </div>
      </main>
    );
  }

  if (!session) return null;

  return (
    <main className="min-h-screen bg-[#eef2fb] px-4 py-8 dark:bg-[#0A0F1E] sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
                    Welcome to AIDemic
                  </p>
                  <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Set up your revision space</h1>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                AIDemic uses your saved qualifications to make notes, flashcards, and practice questions match the exact course you study. Add your subjects once here, then the rest of the app will use them automatically.
              </p>
            </div>
            <button type="button" onClick={handleSignOut} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {appSteps.map((step) => {
              const Icon = step.icon;
              return (
                <article key={step.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/6 dark:bg-white/3">
                  <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  <h2 className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-100">{step.title}</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">{step.text}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-400">Your courses</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">Choose your subjects</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Add each qualification you want AIDemic to generate content for.
              </p>
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
                >
                  {COUNTRIES.map((country) => (
                    <option key={country} value={country}>{COUNTRY_LABELS[country]}</option>
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
                >
                  {qualifications.map((qual) => (
                    <option key={qual.id} value={qual.id}>{qual.label}</option>
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
                    >
                      {boardOptions.map((board) => (
                        <option key={board} value={board}>{getExamBoardLabel(board)}</option>
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
                    >
                      {SELECTABLE_SUBJECTS.map((subject) => (
                        <option key={subject} value={subject}>{getSubjectLabel(subject)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Specification + Tier + Add */}
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
                  {specEntries.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
                      No specification options are available for this combination.
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
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
                    >
                      <option value="">Select specification</option>
                      {specEntries.map((entry) => (
                        <option key={entry.name} value={entry.name}>{entry.name}</option>
                      ))}
                    </select>
                  )}
                  {selectedSpecEntry?.tiers?.length ? (
                    <select
                      value={newSpecTier}
                      onChange={(event) => setNewSpecTier(event.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
                    >
                      <option value="">Tier</option>
                      {selectedSpecEntry.tiers.map((tier) => (
                        <option key={tier} value={tier}>{tier}</option>
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
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-950/35 dark:text-red-200">
                {subjectError}
              </p>
            ) : null}
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Saved qualifications</h2>
            </div>
            <div className="mt-4 space-y-2">
              {subjects.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
                  Add at least one subject to continue.
                </p>
              ) : (
                subjects.map((subject) => {
                  const specLabel = buildSpecString(subject.spec_name ?? '', subject.spec_tier ?? '', '');
                  return (
                    <div key={subject.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-white/6">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {getSubjectLabel(subject.subject)}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {getExamBoardLabel(subject.exam_board)} {subject.exam_type === 'a-level' ? 'A-Level' : 'GCSE'}
                        </p>
                        {specLabel ? (
                          <p className="mt-0.5 truncate text-xs text-emerald-700 dark:text-emerald-300">{specLabel}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubject(subject.id)}
                        className="shrink-0 text-slate-400 transition hover:text-red-500 dark:hover:text-red-400"
                        aria-label="Remove subject"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              disabled={subjects.length === 0}
              className={buttonStyles({ variant: 'primary', size: 'lg', className: 'mt-5 w-full' })}
            >
              Continue to dashboard
            </button>
          </aside>
        </section>
      </div>
    </main>
  );
}
