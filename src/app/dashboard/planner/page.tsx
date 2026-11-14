'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CheckCircle2, Circle, Radar, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { buttonStyles } from '@/components/ui/button';
import { PageHeader, EmptyState } from '@/components/ui/feedback';
import { Chip, Meter, MonoLabel, Panel, PanelHeading, StatusBar, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { getSubjectLabel } from '@/lib/ai/subjectConfig';
import { mapStudentSubjectRow, STUDENT_SUBJECT_SELECT, type StudentSubjectRow } from '@/lib/ai/studentSubjects';
import { buildRevisionPlan, daysUntilExam, type PlannerSubject } from '@/lib/revisionPlanner';
import { readDueSubtopics } from '@/lib/mastery/read';
import { useToast } from '@/components/ToastProvider';

type SubjectRow = StudentSubjectRow & { exam_date: string | null; target_grade: string | null };

type PlanRow = {
  id: string;
  title: string;
  planned_date: string;
  estimated_minutes: number | null;
  status: string | null;
  subtopic_id: string | null;
};

type SubjectInfo = {
  id: string;
  label: string;
  examDate: string | null;
  targetGrade: string | null;
  weakTopics: string[];
  /** Set only for subjects the Learning Spine has measured. */
  weakTopicRetrievability?: number[];
  weakTopicSubtopicIds?: (string | null)[];
};

/** Weak topics per subject to carry into one plan. */
const MAX_WEAK_TOPICS = 6;

const PLAN_TERM_NAME = 'AIDemic Revision Plan';

const formatDay = (iso: string) =>
  new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${iso}T00:00:00`));

export default function PlannerPage() {
  const { session } = useAuth();
  const { showToast } = useToast();
  const userId = session?.user?.id;

  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [items, setItems] = useState<PlanRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    const supabase = createClient();

    const [{ data: subjectRows }, { data: attemptRows }, { data: termRows }, dueSubtopics] = await Promise.all([
      supabase
        .from('student_subjects')
        .select(`id, exam_date, target_grade, ${STUDENT_SUBJECT_SELECT}`)
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
      supabase
        .from('exam_practice_attempts')
        .select('subject, weakness_tags, weakness_analysis')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(60),
      supabase.from('academic_terms').select('id').eq('user_id', userId).eq('name', PLAN_TERM_NAME).maybeSingle(),
      // Already ordered overdue-first then weakest-first, which is the order the
      // planner wants to cycle sessions through.
      readDueSubtopics(supabase, userId),
    ]);

    // Weak topics grouped by raw subject key.
    const weakBySubject = new Map<string, Set<string>>();
    for (const a of (attemptRows ?? []) as { subject: string; weakness_tags: string[] | null; weakness_analysis: string[] | null }[]) {
      const tags = (a.weakness_tags?.length ? a.weakness_tags : a.weakness_analysis) ?? [];
      const set = weakBySubject.get(a.subject) ?? new Set<string>();
      for (const t of tags) {
        const clean = t.replace(/^Main pattern to fix:\s*/i, '').trim().slice(0, 60);
        if (clean) set.add(clean);
      }
      weakBySubject.set(a.subject, set);
    }

    // Spine-measured subtopics, keyed by the same lowercase subject name
    // mapStudentSubjectRow produces, so the two paths are interchangeable below.
    const spineBySubject = new Map<string, typeof dueSubtopics>();
    for (const row of dueSubtopics) {
      spineBySubject.set(row.scope.subject, [...(spineBySubject.get(row.scope.subject) ?? []), row]);
    }

    const infos: SubjectInfo[] = ((subjectRows ?? []) as unknown as SubjectRow[]).map((row) => {
      const mapped = mapStudentSubjectRow(row);
      const spine = (spineBySubject.get(mapped.subject) ?? []).slice(0, MAX_WEAK_TOPICS);

      // The spine gives real curriculum subtopics with a measured retrievability;
      // weakness_tags gives LLM-authored strings and no measurement. Prefer the
      // former per subject, and keep the latter for subjects it has not reached
      // yet -- a student mid-migration should not lose their timetable.
      const base = {
        id: row.id,
        label: getSubjectLabel(mapped.subject),
        examDate: row.exam_date,
        targetGrade: row.target_grade,
      };

      if (spine.length > 0) {
        return {
          ...base,
          weakTopics: spine.map((item) => item.subtopicName),
          weakTopicRetrievability: spine.map((item) => item.retrievability),
          weakTopicSubtopicIds: spine.map((item) => item.subtopicId),
        };
      }

      return {
        ...base,
        weakTopics: [...(weakBySubject.get(mapped.subject) ?? new Set())].slice(0, MAX_WEAK_TOPICS),
      };
    });
    setSubjects(infos);

    const termId = (termRows as { id: string } | null)?.id ?? null;
    if (termId) {
      const { data: planRows } = await supabase
        .from('study_plan_items')
        .select('id, title, planned_date, estimated_minutes, status, subtopic_id')
        .eq('term_id', termId)
        .gte('planned_date', new Date().toISOString().slice(0, 10))
        .order('planned_date', { ascending: true });
      setItems((planRows ?? []) as PlanRow[]);
    } else {
      setItems([]);
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    // Defer so the synchronous setState inside load() doesn't run directly in
    // the effect body (matches the pattern used across the dashboard pages).
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const upcomingExams = useMemo(
    () =>
      subjects
        .map((s) => ({ ...s, days: daysUntilExam(s.examDate) }))
        .filter((s) => s.days !== null && (s.days as number) >= 0)
        .sort((a, b) => (a.days as number) - (b.days as number)),
    [subjects]
  );

  const handleGenerate = async () => {
    if (!userId) return;
    setIsGenerating(true);
    const supabase = createClient();

    const plannerSubjects: PlannerSubject[] = subjects.map((s) => ({
      id: s.id,
      label: s.label,
      examDate: s.examDate,
      weakTopics: s.weakTopics,
      weakTopicRetrievability: s.weakTopicRetrievability,
      weakTopicSubtopicIds: s.weakTopicSubtopicIds,
    }));
    const plan = buildRevisionPlan(plannerSubjects);

    if (plan.length === 0) {
      showToast('error', 'Add an exam date to at least one subject first.');
      setIsGenerating(false);
      return;
    }

    // Get or create the plan's academic term (owns items via RLS).
    let termId: string;
    const { data: existingTerm } = await supabase
      .from('academic_terms')
      .select('id')
      .eq('user_id', userId)
      .eq('name', PLAN_TERM_NAME)
      .maybeSingle();

    if (existingTerm) {
      termId = (existingTerm as { id: string }).id;
      // Clear future items so regeneration replaces rather than duplicates.
      await supabase
        .from('study_plan_items')
        .delete()
        .eq('term_id', termId)
        .gte('planned_date', new Date().toISOString().slice(0, 10));
    } else {
      const lastDate = plan[plan.length - 1].plannedDate;
      const { data: newTerm, error: termError } = await supabase
        .from('academic_terms')
        .insert({
          user_id: userId,
          name: PLAN_TERM_NAME,
          start_date: new Date().toISOString().slice(0, 10),
          end_date: lastDate,
          description: 'Auto-generated revision timetable',
        })
        .select('id')
        .single();
      if (termError || !newTerm) {
        showToast('error', 'Could not create your plan. Please try again.');
        setIsGenerating(false);
        return;
      }
      termId = (newTerm as { id: string }).id;
    }

    const { error: insertError } = await supabase.from('study_plan_items').insert(
      plan.map((item) => ({
        term_id: termId,
        title: item.title,
        planned_date: item.plannedDate,
        estimated_minutes: item.estimatedMinutes,
        status: 'planned',
        subtopic_id: item.subtopicId ?? null,
      }))
    );

    if (insertError) {
      showToast('error', 'Could not save your plan. Please try again.');
    } else {
      showToast('success', `Generated ${plan.length} revision sessions.`);
      await load();
    }
    setIsGenerating(false);
  };

  const toggleItem = async (item: PlanRow) => {
    const nextStatus = item.status === 'done' ? 'planned' : 'done';
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: nextStatus } : i)));
    const supabase = createClient();
    await supabase.from('study_plan_items').update({ status: nextStatus }).eq('id', item.id);
  };

  const deleteItem = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    await supabase.from('study_plan_items').delete().eq('id', id);
  };

  const itemsByDate = useMemo(() => {
    const groups = new Map<string, PlanRow[]>();
    for (const item of items) {
      groups.set(item.planned_date, [...(groups.get(item.planned_date) ?? []), item]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const doneCount = items.filter((i) => i.status === 'done').length;

  const generateButton = (
    <button
      type="button"
      onClick={handleGenerate}
      disabled={isGenerating || subjects.length === 0}
      className={buttonStyles({ variant: 'primary', className: 'max-sm:w-full' })}
    >
      <Wand2 className="h-4 w-4" />
      {isGenerating ? 'Generating…' : items.length > 0 ? 'Regenerate plan' : 'Generate plan'}
    </button>
  );

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Exam countdown</PanelHeading>
      {items.length > 0 ? (
        <Panel>
          <div className="flex items-baseline justify-between gap-2">
            <MonoLabel>Sessions done</MonoLabel>
            <span className="font-mono text-xs text-content-subtle">
              {doneCount} / {items.length}
            </span>
          </div>
          <Meter fraction={items.length ? doneCount / items.length : 0} className="mt-3" label="Sessions done" />
        </Panel>
      ) : null}
      {upcomingExams.length > 0 ? (
        upcomingExams.map((exam) => (
          <Panel key={exam.id}>
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold text-content">{exam.label}</p>
              {exam.targetGrade && <Chip tone="success">Target {exam.targetGrade}</Chip>}
            </div>
            <p className={`mt-2 font-mono text-2xl font-semibold ${exam.days !== null && exam.days <= 14 ? 'text-danger' : 'text-content'}`}>
              {exam.days === 0 ? 'Today' : `${exam.days} ${exam.days === 1 ? 'day' : 'days'}`}
            </p>
            <p className="font-mono text-[11px] text-content-subtle">
              {new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' }).format(
                new Date(`${exam.examDate}T00:00:00`)
              )}
            </p>
          </Panel>
        ))
      ) : (
        <Panel>
          <p className="text-sm font-semibold text-content">No exam dates yet</p>
          <p className="mt-1 text-[13px] text-content-subtle">
            Add exam dates on the{' '}
            <Link href="/dashboard/subjects" className="font-semibold text-accent hover:underline">
              Subjects
            </Link>{' '}
            page and they count down here.
          </p>
        </Panel>
      )}
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={CalendarDays}
        eyebrow="Review / Timetable"
        title="Revision Planner"
        description="A timetable weighted toward your weakest topics and nearest exams."
        actions={
          <>
            <Chip>● Mode: weak topics first</Chip>
            {upcomingExams[0] ? (
              <Chip tone="danger">
                <CalendarDays className="h-3 w-3" /> Next exam: {upcomingExams[0].days === 0 ? 'today' : `${upcomingExams[0].days}d`}
              </Chip>
            ) : null}
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        {isLoading ? (
          <p className="p-5 text-body text-content-subtle">Loading your plan…</p>
        ) : subjects.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Sparkles}
              title="No subjects yet"
              description="Add your subjects and exam dates, then generate a revision timetable."
              action={
                <Link href="/dashboard/subjects" className={buttonStyles({ variant: 'primary' })}>
                  Add subjects
                </Link>
              }
            />
          </div>
        ) : upcomingExams.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={CalendarDays}
              title="Set your exam dates"
              description="Add an exam date to your subjects so the planner can build a timetable that counts down to each paper."
              action={
                <Link href="/dashboard/subjects" className={buttonStyles({ variant: 'primary' })}>
                  Set exam dates
                </Link>
              }
            />
          </div>
        ) : items.length === 0 ? (
          <>
            <div className="flex-1 p-5">
              <EmptyState
                icon={Wand2}
                title="No plan yet"
                description="Generate a timetable and it will appear here, weighted toward your weak topics."
              />
            </div>
            <div className="flex justify-end border-t border-subtle p-4">{generateButton}</div>
          </>
        ) : (
          <>
            <StatusBar>
              <span>
                <span className="font-semibold text-content">{doneCount}</span> of{' '}
                <span className="font-semibold text-content">{items.length}</span> sessions done
              </span>
              <span>{itemsByDate.length} days planned</span>
            </StatusBar>

            <section className="flex-1 space-y-3 p-5" aria-label="Revision timetable">
              {itemsByDate.map(([date, dayItems]) => (
                <div key={date} className="rounded-lg border border-subtle bg-surface">
                  <h2 className="border-b border-subtle px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-content-subtle">
                    {formatDay(date)}
                  </h2>
                  <ul className="divide-y divide-subtle">
                    {dayItems.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleItem(item)}
                          aria-pressed={item.status === 'done'}
                          aria-label={item.status === 'done' ? 'Mark as not done' : 'Mark as done'}
                          className="shrink-0 text-success"
                        >
                          {item.status === 'done' ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : (
                            <Circle className="h-5 w-5 text-content-subtle" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={`text-body ${item.status === 'done' ? 'text-content-subtle line-through' : 'text-content'}`}>
                            {item.title}
                          </p>
                          <p className="font-mono text-xs text-content-subtle">
                            {item.estimated_minutes ?? 30} min
                            {item.subtopic_id ? (
                              <>
                                {' · '}
                                <Link
                                  href={`/dashboard/daily-review?subtopic=${item.subtopic_id}`}
                                  className="font-semibold text-accent hover:underline"
                                >
                                  Practise now
                                </Link>
                              </>
                            ) : null}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteItem(item.id)}
                          className="shrink-0 text-content-subtle transition hover:text-danger"
                          aria-label="Remove session"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle p-4">
              <p className="font-mono text-xs text-content-subtle max-sm:hidden">Regenerating replaces today&apos;s and later sessions</p>
              {generateButton}
            </div>
          </>
        )}
      </WorkspaceBody>
    </Workspace>
  );
}
