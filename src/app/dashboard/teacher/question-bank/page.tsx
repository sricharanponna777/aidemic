'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { MathContent } from '@/components/MathContent';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { PageLoader } from '@/components/PageLoader';
import { buildSpecString } from '@/lib/ai/subjectConfig';
import { normalizeBoard, normalizeExamType } from '@/lib/ai/validation';
import type { ExamQuestion } from '@/app/api/ai/generate-questions/route';

const selectClass =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100';

type Tab = 'browse' | 'generate' | 'saved';

const TABS: { id: Tab; label: string }[] = [
  { id: 'browse', label: 'Browse curriculum' },
  { id: 'generate', label: 'Generate questions' },
  { id: 'saved', label: 'Saved assignments' },
];

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

type Topic = { id: string; name: string };
type Subtopic = { id: string; name: string; topic_id: string };
type Objective = { id: string; objective: string };
type SavedAssignment = { id: string; title: string; class_id: string; assignment_type: string; created_at: string | null; topics: { name: string } | null };

export default function TeacherQuestionBankPage() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const supabase = createClient();

  const [pageLoading, setPageLoading] = useState(true);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [savedAssignments, setSavedAssignments] = useState<SavedAssignment[]>([]);

  const [tab, setTab] = useState<Tab>('browse');
  const [classId, setClassId] = useState('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);

  const [genTopicId, setGenTopicId] = useState('');
  const [genSubtopicId, setGenSubtopicId] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [preview, setPreview] = useState<ExamQuestion[]>([]);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

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
      const tId = (teacherRow as { id: string }).id;
      setTeacherId(tId);

      const { data: classRows } = await supabase
        .from('classes')
        .select('id, name, status, specification_id, specifications ( name, tier, subjects ( id, name, exam_boards ( name, qualifications ( name ) ) ) )')
        .eq('teacher_id', tId)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      const classList = (classRows as unknown as ClassOption[]) ?? [];
      setClasses(classList);

      const classIds = classList.map((c) => c.id);
      if (classIds.length > 0) {
        const { data: assignmentRows } = await supabase
          .from('assignments')
          .select('id, title, class_id, assignment_type, created_at, topics ( name )')
          .in('class_id', classIds)
          .order('created_at', { ascending: false });
        if (!cancelled) setSavedAssignments((assignmentRows as unknown as SavedAssignment[]) ?? []);
      }
      setPageLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, profile, router, supabase]);

  const activeClasses = classes.filter((c) => c.status !== 'archived');
  const effectiveClassId = classId || activeClasses[0]?.id || '';
  const selectedClass = classes.find((c) => c.id === effectiveClassId);

  // Load curriculum (topics + objectives) for the selected class.
  useEffect(() => {
    if (!selectedClass) return;
    let cancelled = false;
    const load = async () => {
      if (selectedClass.specification_id) {
        const { data } = await supabase.from('topics').select('id, name').eq('specification_id', selectedClass.specification_id).order('order_index', { ascending: true });
        if (!cancelled) setTopics((data as Topic[]) ?? []);
      }
      const subjectId = selectedClass.specifications?.subjects?.id;
      if (subjectId) {
        const { data } = await supabase
          .from('learning_objectives')
          .select('id, objective, applies_to')
          .eq('subject_id', subjectId)
          .contains('applies_to', ['exam_practice']);
        if (!cancelled) setObjectives(((data ?? []) as { id: string; objective: string }[]).map((o) => ({ id: o.id, objective: o.objective })));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedClass, supabase]);

  // Load subtopics for whichever topic is expanded (browse) or selected (generate).
  const subtopicTopicId = tab === 'browse' ? expandedTopicId : genTopicId;
  useEffect(() => {
    if (!subtopicTopicId) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from('subtopics').select('id, name, topic_id').eq('topic_id', subtopicTopicId).order('order_index', { ascending: true });
      if (!cancelled) setSubtopics((prev) => [...prev.filter((s) => s.topic_id !== subtopicTopicId), ...((data as Subtopic[]) ?? [])]);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [subtopicTopicId, supabase]);

  const genSubtopics = useMemo(() => subtopics.filter((s) => s.topic_id === genTopicId), [subtopics, genTopicId]);
  const classNameById = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);

  const handleGenerate = async () => {
    if (!teacherId || !selectedClass) {
      setGenError('Choose a class first.');
      return;
    }
    setGenError('');
    const topic = topics.find((t) => t.id === genTopicId);
    if (!topic) {
      setGenError('Choose a topic to generate questions for.');
      return;
    }
    const subtopic = subtopics.find((s) => s.id === genSubtopicId);
    const subjectChain = selectedClass.specifications?.subjects;
    const board = subjectChain?.exam_boards;
    const qualification = board?.qualifications;
    if (!subjectChain || !board || !qualification) {
      setGenError('This class is missing curriculum details.');
      return;
    }
    const examBoard = normalizeBoard(board.name);
    const examType = normalizeExamType(qualification.name);
    if (!examBoard || !examType) {
      setGenError('Could not resolve this class exam board/type.');
      return;
    }

    setIsGenerating(true);
    setPreview([]);
    setRevealed(new Set());
    try {
      const response = await fetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.name,
          subtopic: subtopic?.name || '',
          subject: subjectChain.name.toLowerCase(),
          examBoard,
          examType,
          specification: buildSpecString(selectedClass.specifications?.name ?? '', selectedClass.specifications?.tier ?? '', ''),
          questionCount,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setGenError(body.error || 'Failed to generate questions.');
        return;
      }
      setPreview((body.questions as ExamQuestion[]) ?? []);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate questions.');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleRevealed = (index: number) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  if (isLoading || pageLoading) {
    return <PageLoader text="Loading question bank..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Question Bank</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Browse the curriculum, generate practice questions, and reuse saved assignments.</p>
      </div>

      {classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/3 dark:text-slate-400">
          Create a class first — the question bank follows its subject and exam board.{' '}
          <Link href="/dashboard/teacher/classes" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Create a class
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    tab === t.id
                      ? 'bg-linear-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/6'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tab !== 'saved' && (
              <select value={effectiveClassId} onChange={(e) => { setClassId(e.target.value); setExpandedTopicId(null); setGenTopicId(''); setGenSubtopicId(''); setPreview([]); }} className={selectClass}>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Browse curriculum */}
          {tab === 'browse' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E] lg:col-span-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Topics</h2>
                {selectedClass && (
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {selectedClass.specifications?.subjects?.exam_boards?.qualifications?.name} · {selectedClass.specifications?.subjects?.exam_boards?.name} · {selectedClass.specifications?.subjects?.name}
                  </p>
                )}
                {topics.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No topics found for this specification.</p>
                ) : (
                  <div className="mt-4 space-y-1.5">
                    {topics.map((topic) => {
                      const isExpanded = expandedTopicId === topic.id;
                      const topicSubtopics = subtopics.filter((s) => s.topic_id === topic.id);
                      return (
                        <div key={topic.id} className="rounded-lg border border-slate-200 dark:border-white/6">
                          <button
                            type="button"
                            onClick={() => setExpandedTopicId(isExpanded ? null : topic.id)}
                            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-slate-800 dark:text-slate-200"
                          >
                            {topic.name}
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                          </button>
                          {isExpanded && (
                            <div className="border-t border-slate-200 px-4 py-2 dark:border-white/6">
                              {topicSubtopics.length === 0 ? (
                                <p className="py-1 text-xs text-slate-400 dark:text-slate-500">No subtopics listed.</p>
                              ) : (
                                <ul className="space-y-1">
                                  {topicSubtopics.map((s) => (
                                    <li key={s.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                      <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                                      {s.name}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Learning objectives</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Exam skills AIDemic can target for this subject.</p>
                {objectives.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No learning objectives listed for this subject yet.</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {objectives.map((o) => (
                      <li key={o.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 dark:border-white/6 dark:text-slate-300">
                        {o.objective}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {/* Generate questions */}
          {tab === 'generate' && (
            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Preview the questions AIDemic would produce for any topic. To set them as an assignment for students, use the{' '}
                  <Link href="/dashboard/teacher/assignments" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                    Assignments
                  </Link>{' '}
                  page.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Topic</label>
                    <select value={genTopicId} onChange={(e) => { setGenTopicId(e.target.value); setGenSubtopicId(''); }} className={`${selectClass} w-full`}>
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
                    <select value={genSubtopicId} onChange={(e) => setGenSubtopicId(e.target.value)} disabled={!genTopicId || genSubtopics.length === 0} className={`${selectClass} w-full`}>
                      <option value="">Whole topic</option>
                      {genSubtopics.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
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
                {genError ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{genError}</p> : null}
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={handleGenerate} disabled={isGenerating} className={buttonStyles({ variant: 'primary' })}>
                    <Sparkles className="h-4 w-4" />
                    {isGenerating ? 'Generating...' : 'Generate preview'}
                  </button>
                </div>
              </section>

              {preview.length > 0 && (
                <section className="space-y-3">
                  {preview.map((q, i) => (
                    <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          <span>Q{i + 1}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 dark:bg-white/10 dark:text-slate-400">{q.marks} mark{q.marks === 1 ? '' : 's'}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 dark:bg-white/10 dark:text-slate-400">{q.commandWord}</span>
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-slate-800 dark:text-slate-200">
                        <MathContent content={q.question} />
                      </div>
                      {q.questionType === 'mcq' && q.options.length > 0 && (
                        <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                          {q.options.map((opt, oi) => (
                            <li key={oi} className={revealed.has(i) && ['A', 'B', 'C', 'D'][oi] === q.correctOption ? 'font-semibold text-emerald-600 dark:text-emerald-400' : ''}>
                              {['A', 'B', 'C', 'D'][oi]}. <MathContent content={opt} inline />
                            </li>
                          ))}
                        </ul>
                      )}
                      <button type="button" onClick={() => toggleRevealed(i)} className="mt-3 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                        {revealed.has(i) ? 'Hide' : 'Show'} mark scheme
                      </button>
                      {revealed.has(i) && (
                        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-white/6 dark:bg-white/3">
                          {q.markScheme.length > 0 && (
                            <ul className="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
                              {q.markScheme.map((point, pi) => (
                                <li key={pi}>
                                  <MathContent content={point} inline />
                                </li>
                              ))}
                            </ul>
                          )}
                          {q.modelAnswer && (
                            <div className="mt-2 text-slate-700 dark:text-slate-300">
                              <span className="font-semibold">Model answer: </span>
                              <MathContent content={q.modelAnswer} inline />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              )}
            </div>
          )}

          {/* Saved assignments */}
          {tab === 'saved' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Saved assignments</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Every question set you&apos;ve created, newest first.</p>
              {savedAssignments.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">You haven&apos;t created any assignments yet.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {savedAssignments.map((a) => (
                    <Link
                      key={a.id}
                      href={`/dashboard/teacher/classes/${a.class_id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm transition hover:border-indigo-300 dark:border-white/6 dark:hover:border-indigo-500/40"
                    >
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{a.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                          {classNameById.get(a.class_id) ?? 'Class'}
                          {a.topics?.name ? ` · ${a.topics.name}` : ''}
                          {` · ${a.assignment_type}`}
                        </p>
                      </div>
                      {a.created_at && <span className="text-xs text-slate-400 dark:text-slate-500">{new Date(a.created_at).toLocaleDateString()}</span>}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
