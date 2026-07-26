'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CheckCircle2, Circle, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { buttonStyles } from '@/components/ui/button';
import { PageHeader, EmptyState } from '@/components/ui/feedback';
import { getSubjectLabel } from '@/lib/ai/subjectConfig';
import { mapStudentSubjectRow, STUDENT_SUBJECT_SELECT, type StudentSubjectRow } from '@/lib/ai/studentSubjects';
import { buildRevisionPlan, daysUntilExam, type PlannerSubject } from '@/lib/revisionPlanner';
import { useToast } from '@/components/ToastProvider';

type SubjectRow = StudentSubjectRow & { exam_date: string | null; target_grade: string | null };

type PlanRow = {
  id: string;
  title: string;
  planned_date: string;
  estimated_minutes: number | null;
  status: string | null;
};

type SubjectInfo = {
  id: string;
  label: string;
  examDate: string | null;
  targetGrade: string | null;
  weakTopics: string[];
};

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

    const [{ data: subjectRows }, { data: attemptRows }, { data: termRows }] = await Promise.all([
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

    const infos: SubjectInfo[] = ((subjectRows ?? []) as unknown as SubjectRow[]).map((row) => {
      const mapped = mapStudentSubjectRow(row);
      return {
        id: row.id,
        label: getSubjectLabel(mapped.subject),
        examDate: row.exam_date,
        targetGrade: row.target_grade,
        weakTopics: [...(weakBySubject.get(mapped.subject) ?? new Set())].slice(0, 6),
      };
    });
    setSubjects(infos);

    const termId = (termRows as { id: string } | null)?.id ?? null;
    if (termId) {
      const { data: planRows } = await supabase
        .from('study_plan_items')
        .select('id, title, planned_date, estimated_minutes, status')
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revision Planner"
        description="A timetable weighted toward your weakest topics and nearest exams."
        actions={
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || subjects.length === 0}
            className={buttonStyles({ variant: 'primary' })}
          >
            <Wand2 className="h-4 w-4" />
            {isGenerating ? 'Generating…' : items.length > 0 ? 'Regenerate plan' : 'Generate plan'}
          </button>
        }
      />

      {/* Exam countdowns */}
      {upcomingExams.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {upcomingExams.map((exam) => (
            <div key={exam.id} className="rounded-card border border-subtle bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-content">{exam.label}</p>
                {exam.targetGrade && (
                  <span className="rounded-full bg-accent-muted px-2 py-0.5 text-caption font-semibold text-accent">
                    Target {exam.targetGrade}
                  </span>
                )}
              </div>
              <p className="mt-2 text-2xl font-bold text-content">
                {exam.days === 0 ? 'Today' : `${exam.days} ${exam.days === 1 ? 'day' : 'days'}`}
              </p>
              <p className="text-caption text-content-subtle">
                {new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' }).format(
                  new Date(`${exam.examDate}T00:00:00`)
                )}
              </p>
            </div>
          ))}
        </section>
      )}

      {isLoading ? (
        <p className="text-body text-content-subtle">Loading your plan…</p>
      ) : subjects.length === 0 ? (
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
      ) : upcomingExams.length === 0 ? (
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
      ) : items.length === 0 ? (
        <EmptyState
          icon={Wand2}
          title="No plan yet"
          description="Generate a timetable and it will appear here, weighted toward your weak topics."
        />
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between rounded-card border border-subtle bg-surface px-4 py-3 shadow-card">
            <p className="text-body text-content-muted">
              <span className="font-semibold text-content">{doneCount}</span> of{' '}
              <span className="font-semibold text-content">{items.length}</span> sessions done
            </p>
            <div className="h-2 w-32 overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          {itemsByDate.map(([date, dayItems]) => (
            <div key={date} className="rounded-card border border-subtle bg-surface shadow-card">
              <p className="border-b border-subtle px-4 py-2.5 text-caption font-semibold uppercase tracking-[0.12em] text-content-subtle">
                {formatDay(date)}
              </p>
              <ul className="divide-y divide-subtle">
                {dayItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleItem(item)}
                      aria-pressed={item.status === 'done'}
                      aria-label={item.status === 'done' ? 'Mark as not done' : 'Mark as done'}
                      className="shrink-0 text-accent"
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
                      <p className="text-caption text-content-subtle">{item.estimated_minutes ?? 30} min</p>
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
      )}
    </div>
  );
}
