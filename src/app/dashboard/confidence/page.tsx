'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Gauge, GraduationCap, ListChecks, Radar } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ToastProvider';
import { createClient } from '@/lib/supabase-client';
import { buttonStyles } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/feedback';
import { Chip, Meter, MonoLabel, Panel, PanelHeading, Stat, StatusBar, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { getSubjectLabel } from '@/lib/ai/subjectConfig';
import { mapStudentSubjectRow, STUDENT_SUBJECT_SELECT, type StudentSubjectRow } from '@/lib/ai/studentSubjects';
import { readStudentMastery, type SubtopicMastery } from '@/lib/mastery/read';
import { MASTERY_LABEL, masteryBadgeTone } from '@/lib/masteryTone';
import { SELF_RATINGS, type SelfRating } from '@/lib/mastery/fromSelfRating';

/**
 * Red/amber/green self-rating across a specification.
 *
 * RAG-rating spec points is the standard UK revision technique, and it is the
 * only evidence source that costs a student one click and no model call — which
 * makes it the fastest way to turn an empty knowledge map into a usable one.
 *
 * The measured band sits beside the buttons on purpose. Self-rating alone is a
 * student's opinion of themselves; shown next to what the app actually measured,
 * it becomes the one place they can see the two disagree.
 */

type SubjectRow = StudentSubjectRow & { specification_id: string | null };

type SubjectInfo = {
  id: string;
  label: string;
  specificationId: string;
};

type Topic = { id: string; name: string };
type Subtopic = { id: string; name: string; topicId: string };

const RATING_LABEL: Record<SelfRating, string> = {
  red: 'Red',
  amber: 'Amber',
  green: 'Green',
};

const RATING_HINT: Record<SelfRating, string> = {
  red: "Don't know it",
  amber: 'Shaky',
  green: 'Confident',
};

const ratingTone = (rating: SelfRating, selected: boolean): string => {
  if (!selected) return 'border-subtle bg-surface text-content-subtle hover:border-strong';
  switch (rating) {
    case 'green':
      return 'border-success bg-success-muted text-success';
    case 'amber':
      return 'border-warning bg-warning-muted text-warning';
    default:
      return 'border-danger bg-danger-muted text-danger';
  }
};

export default function ConfidencePage() {
  const { session } = useAuth();
  const { showToast } = useToast();
  const userId = session?.user?.id;

  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<string>('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
  const [mastery, setMastery] = useState<Map<string, SubtopicMastery>>(new Map());
  const [ratings, setRatings] = useState<Map<string, SelfRating>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSpec, setIsLoadingSpec] = useState(false);
  const [saving, setSaving] = useState<Set<string>>(new Set());

  // Subjects, plus the mastery the spine already holds. Read with the browser
  // client throughout: every table here is covered by an `auth.uid() = user_id`
  // or public-reference-data SELECT policy, so RLS does the scoping.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const supabase = createClient();

      const [{ data: subjectRows }, masteryRows] = await Promise.all([
        supabase
          .from('student_subjects')
          .select(`specification_id, ${STUDENT_SUBJECT_SELECT}`)
          .eq('user_id', userId)
          .order('created_at', { ascending: true }),
        // Explicit limit: readStudentMastery defaults to 200, which is sized for
        // picking a handful to practise. This page needs every row a student has,
        // or ratings they made earlier would silently vanish from the list.
        readStudentMastery(supabase, userId, { limit: 2000 }),
      ]);
      if (cancelled) return;

      const infos = ((subjectRows ?? []) as unknown as SubjectRow[])
        .filter((row) => row.specification_id)
        .map((row) => ({
          id: row.id,
          label: getSubjectLabel(mapStudentSubjectRow(row).subject),
          specificationId: row.specification_id as string,
        }));

      setSubjects(infos);
      setActiveSubjectId((current) => current || infos[0]?.id || '');
      setMastery(new Map(masteryRows.map((row) => [row.subtopicId, row])));
      setRatings(
        new Map(
          masteryRows
            .filter((row): row is SubtopicMastery & { selfRating: SelfRating } => row.selfRating !== null)
            .map((row) => [row.subtopicId, row.selfRating])
        )
      );
      setIsLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const activeSubject = useMemo(
    () => subjects.find((subject) => subject.id === activeSubjectId) ?? null,
    [subjects, activeSubjectId]
  );

  // The specification tree. Subtopics are fetched for the whole specification in
  // one query rather than per expanded topic: a spec is a few dozen topics, and
  // one round trip beats a request every time a student opens a row.
  useEffect(() => {
    if (!activeSubject) return;
    let cancelled = false;

    const load = async () => {
      setIsLoadingSpec(true);
      const supabase = createClient();

      const { data: topicRows } = await supabase
        .from('topics')
        .select('id, name')
        .eq('specification_id', activeSubject.specificationId)
        .order('order_index');
      if (cancelled) return;

      const loadedTopics = (topicRows ?? []) as Topic[];
      setTopics(loadedTopics);
      setExpanded(new Set());

      if (loadedTopics.length === 0) {
        setSubtopics([]);
        setIsLoadingSpec(false);
        return;
      }

      const { data: subtopicRows } = await supabase
        .from('subtopics')
        .select('id, name, topic_id')
        .in(
          'topic_id',
          loadedTopics.map((topic) => topic.id)
        )
        .order('order_index');
      if (cancelled) return;

      setSubtopics(
        ((subtopicRows ?? []) as { id: string; name: string; topic_id: string }[]).map((row) => ({
          id: row.id,
          name: row.name,
          topicId: row.topic_id,
        }))
      );
      setIsLoadingSpec(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeSubject]);

  const subtopicsByTopic = useMemo(() => {
    const grouped = new Map<string, Subtopic[]>();
    for (const subtopic of subtopics) {
      grouped.set(subtopic.topicId, [...(grouped.get(subtopic.topicId) ?? []), subtopic]);
    }
    return grouped;
  }, [subtopics]);

  const ratedCount = useMemo(
    () => subtopics.filter((subtopic) => ratings.has(subtopic.id)).length,
    [subtopics, ratings]
  );

  const toggleTopic = (topicId: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const rate = useCallback(
    async (subtopicId: string, rating: SelfRating) => {
      const previous = ratings.get(subtopicId) ?? null;
      // Optimistic: the rating is the student's own claim, so showing it before
      // the round trip cannot be wrong in a way the server would contradict.
      setRatings((current) => new Map(current).set(subtopicId, rating));
      setSaving((current) => new Set(current).add(subtopicId));

      try {
        const response = await fetch('/api/mastery/self-rating', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subtopicId, rating }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setRatings((current) => {
            const next = new Map(current);
            if (previous) next.set(subtopicId, previous);
            else next.delete(subtopicId);
            return next;
          });
          showToast('error', body.error || 'Could not save your rating.');
        }
      } catch {
        setRatings((current) => {
          const next = new Map(current);
          if (previous) next.set(subtopicId, previous);
          else next.delete(subtopicId);
          return next;
        });
        showToast('error', 'Network error while saving your rating.');
      } finally {
        setSaving((current) => {
          const next = new Set(current);
          next.delete(subtopicId);
          return next;
        });
      }
    },
    [ratings, showToast]
  );

  const ratingCounts = SELF_RATINGS.map((rating) => ({
    rating,
    count: subtopics.filter((subtopic) => ratings.get(subtopic.id) === rating).length,
  }));
  const hasSpec = !isLoading && subjects.length > 0 && !isLoadingSpec && topics.length > 0;

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Confidence report</PanelHeading>
      {hasSpec ? (
        <>
          <Panel>
            <div className="flex items-baseline justify-between gap-2">
              <MonoLabel>Rated</MonoLabel>
              <span className="font-mono text-xs text-content-subtle">
                {ratedCount} / {subtopics.length}
              </span>
            </div>
            <Meter fraction={subtopics.length ? ratedCount / subtopics.length : 0} className="mt-3" label="Subtopics rated" />
          </Panel>
          <div className="grid grid-cols-3 gap-2">
            {ratingCounts.map(({ rating, count }) => (
              <Stat
                key={rating}
                label={RATING_LABEL[rating]}
                value={count}
                tone={rating === 'green' ? 'success' : rating === 'amber' ? 'warning' : 'danger'}
              />
            ))}
          </div>
        </>
      ) : null}
      <Panel>
        <p className="text-sm font-semibold text-content">How ratings are used</p>
        <ul className="mt-2 space-y-1.5 text-[13px] text-content-subtle">
          {SELF_RATINGS.map((rating) => (
            <li key={rating}>
              <span className="font-semibold text-content">{RATING_LABEL[rating]}</span>: {RATING_HINT[rating]}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-content-subtle">Your reds go to the front of the review queue.</p>
        <Link
          href="/dashboard/daily-review"
          className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'mt-3 w-full justify-center' })}
        >
          <ListChecks className="h-4 w-4" />
          Daily Review
        </Link>
      </Panel>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={Gauge}
        eyebrow="Review / Self-rating"
        title="Topic Confidence"
        description="Rate each part of your specification red, amber or green. Your reds go to the front of the review queue."
        actions={
          <>
            <Chip>● Mode: red / amber / green</Chip>
            {activeSubject ? <Chip tone="success">{activeSubject.label}</Chip> : null}
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        {isLoading ? (
          <p className="p-5 text-body text-content-subtle">Loading your specification…</p>
        ) : subjects.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={GraduationCap}
              title="No subjects yet"
              description="Add a subject and we'll pull in its specification so you can rate every topic."
              action={
                <Link href="/dashboard/subjects" className={buttonStyles({ variant: 'primary' })}>
                  Add subjects
                </Link>
              }
            />
          </div>
        ) : (
          <>
            {subjects.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-subtle p-5">
                <MonoLabel className="mr-1">Subject</MonoLabel>
                {subjects.map((subject) => (
                  <button
                    key={subject.id}
                    type="button"
                    onClick={() => setActiveSubjectId(subject.id)}
                    aria-pressed={subject.id === activeSubjectId}
                    className={`rounded-md border px-2.5 py-1 font-mono text-xs font-medium transition ${
                      subject.id === activeSubjectId
                        ? 'border-accent bg-accent-muted text-accent'
                        : 'border-subtle bg-surface text-content-subtle hover:border-strong'
                    }`}
                  >
                    {subject.label}
                  </button>
                ))}
              </div>
            )}

            {isLoadingSpec ? (
              <p className="p-5 text-body text-content-subtle">Loading topics…</p>
            ) : topics.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={GraduationCap}
                  title="No topics for this specification"
                  description="This specification has no seeded topics yet, so there is nothing to rate."
                />
              </div>
            ) : (
              <>
                <StatusBar>
                  <span>
                    <span className="font-semibold text-content">{ratedCount}</span> of{' '}
                    <span className="font-semibold text-content">{subtopics.length}</span> subtopics rated
                  </span>
                  <span>{topics.length} topics</span>
                </StatusBar>

                <section className="flex-1 space-y-2 p-5" aria-label="Specification topics">
                  {topics.map((topic) => {
                    const topicSubtopics = subtopicsByTopic.get(topic.id) ?? [];
                    const isOpen = expanded.has(topic.id);
                    const topicRated = topicSubtopics.filter((subtopic) => ratings.has(subtopic.id)).length;

                    return (
                      <div key={topic.id} className="rounded-lg border border-subtle bg-surface">
                        <button
                          type="button"
                          onClick={() => toggleTopic(topic.id)}
                          aria-expanded={isOpen}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left"
                        >
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-content-subtle" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-content-subtle" />
                          )}
                          <span className="min-w-0 flex-1 font-semibold text-content">{topic.name}</span>
                          <span className="shrink-0 font-mono text-xs text-content-subtle">
                            {topicRated}/{topicSubtopics.length}
                          </span>
                        </button>

                        {isOpen && (
                          <ul className="divide-y divide-subtle border-t border-subtle">
                            {topicSubtopics.map((subtopic) => {
                              const measured = mastery.get(subtopic.id);
                              const band = measured?.band ?? 'unknown';
                              const selected = ratings.get(subtopic.id) ?? null;

                              return (
                                <li key={subtopic.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-body text-content">{subtopic.name}</p>
                                    <span
                                      className={`mt-1 inline-flex rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${masteryBadgeTone(band)}`}
                                    >
                                      {MASTERY_LABEL[band]}
                                    </span>
                                  </div>

                                  <div role="group" aria-label={`Confidence for ${subtopic.name}`} className="flex shrink-0 gap-1.5">
                                    {SELF_RATINGS.map((rating) => (
                                      <button
                                        key={rating}
                                        type="button"
                                        disabled={saving.has(subtopic.id)}
                                        onClick={() => void rate(subtopic.id, rating)}
                                        aria-pressed={selected === rating}
                                        title={RATING_HINT[rating]}
                                        className={`rounded-md border px-3 py-1.5 font-mono text-xs font-semibold transition disabled:opacity-60 ${ratingTone(rating, selected === rating)}`}
                                      >
                                        {RATING_LABEL[rating]}
                                      </button>
                                    ))}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </section>
              </>
            )}
          </>
        )}
      </WorkspaceBody>
    </Workspace>
  );
}
