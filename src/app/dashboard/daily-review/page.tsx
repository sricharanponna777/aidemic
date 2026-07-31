'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ListChecks, RotateCcw, Sparkles, Target } from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { buttonStyles } from '@/components/ui/button';
import { PageHero } from '@/components/ui/feedback';
import { REVIEW_GRADES, useReviewShortcuts } from '@/hooks/useReviewShortcuts';
import { hasCloze, maskAllCloze, revealAllCloze } from '@/lib/cloze';
import { useAuth } from '@/hooks/useAuth';
import { useUserSubjects } from '@/hooks/useUserSubjects';
import { useToast } from '@/components/ToastProvider';
import { createClient } from '@/lib/supabase-client';
import { formatInterval, previewNextReview } from '@/lib/spacedRepetition';
import { readDueSubtopics, readStudentMastery } from '@/lib/mastery/read';
import { MASTERY_LABEL, masteryBadgeTone } from '@/lib/masteryTone';
import { getSubjectLabel } from '@/lib/ai/subjectConfig';
import type { MasteryBand } from '@/lib/mastery';
import type { Flashcard } from '@/types';

const MAX_DUE_FLASHCARDS = 15;
const MAX_WEAK_TOPICS = 3;
const FLASHCARDS_PER_MICROQUESTION = 3;

type ExamQuestion = {
  questionType: 'open' | 'mcq' | 'plot';
  question: string;
  options: string[];
  correctOption: '' | 'A' | 'B' | 'C' | 'D';
  markScheme: string[];
  modelAnswer: string;
};

type QueueItem =
  | { kind: 'flashcard'; id: string; front: string; back: string; card: Flashcard }
  | {
      kind: 'microquestion';
      id: string;
      front: string;
      back: string;
      weaknessTag: string;
      subjectLabel: string;
      questionType: ExamQuestion['questionType'];
      options: string[];
      correctOption: '' | 'A' | 'B' | 'C' | 'D';
      /** Set when the server stored this question and will mark it itself. */
      itemId?: string;
    };

/**
 * A target for one micro-question.
 *
 * Two things can produce these. The Learning Spine gives a real curriculum
 * subtopic with a measured mastery band; before a student has any spine
 * evidence, the older weakness-tag path gives a free-text label and nothing
 * else. The spine-only fields are optional so both paths feed one renderer.
 */
type WeakTopicSummary = {
  /** Display label: the subtopic name, or the weakness tag on the fallback path. */
  tag: string;
  count: number;
  subject: string;
  examBoard: string;
  examType: string;
  specName: string | null;
  specTier: string | null;
  /** Set only when this came from the spine. */
  subtopicId?: string;
  topicName?: string;
  subtopicName?: string;
  band?: MasteryBand;
};

type Phase = 'idle' | 'loading' | 'reviewing' | 'summary';

const normalizeInsightLabel = (value: string) =>
  value
    .replace(/^Main pattern to fix:\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim()
    .slice(0, 70);

const parseDateTime = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildMicroQuestionBack = (question: ExamQuestion) => {
  const parts: string[] = [];
  if (question.questionType === 'mcq' && question.correctOption) {
    const index = ['A', 'B', 'C', 'D'].indexOf(question.correctOption);
    const optionText = question.options[index];
    parts.push(`**Correct answer: ${question.correctOption}**${optionText ? ` — ${optionText}` : ''}`);
  }
  if (question.modelAnswer) parts.push(question.modelAnswer);
  if (question.markScheme?.length) parts.push(question.markScheme.map((point) => `- ${point}`).join('\n'));
  return parts.filter(Boolean).join('\n\n') || 'No answer guidance was generated for this question.';
};

const interleaveQueue = (flashcardItems: QueueItem[], microItems: QueueItem[]): QueueItem[] => {
  const result: QueueItem[] = [];
  let fi = 0;
  let mi = 0;
  while (fi < flashcardItems.length || mi < microItems.length) {
    for (let i = 0; i < FLASHCARDS_PER_MICROQUESTION && fi < flashcardItems.length; i++) {
      result.push(flashcardItems[fi]);
      fi += 1;
    }
    if (mi < microItems.length) {
      result.push(microItems[mi]);
      mi += 1;
    }
  }
  return result;
};

export default function DailyReviewPage() {
  const { session } = useAuth();
  const { subjects: userSubjects } = useUserSubjects();
  const { showToast } = useToast();
  const userId = session?.user?.id;

  const [phase, setPhase] = useState<Phase>('idle');
  const [dueFlashcardCount, setDueFlashcardCount] = useState(0);
  const [weakTopics, setWeakTopics] = useState<WeakTopicSummary[]>([]);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [selectedOption, setSelectedOption] = useState<'' | 'A' | 'B' | 'C' | 'D'>('');
  const [summary, setSummary] = useState<{ flashcardsStudied: number; microAttempted: number; microCorrect: number } | null>(null);

  const sessionStartedAtRef = useRef<Date | null>(null);
  const deckCountsRef = useRef<Map<string, number>>(new Map());
  const microStatsRef = useRef({ attempted: 0, correct: 0 });

  useEffect(() => {
    const loadSummary = async () => {
      if (!userId) return;
      setIsLoadingSummary(true);
      try {
        const supabase = createClient();
        const [decksResponse, attemptsResponse] = await Promise.all([
          supabase.from('flashcard_decks').select('id').eq('user_id', userId),
          supabase
            .from('exam_practice_attempts')
            .select('subject, weakness_tags, weakness_analysis, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(30),
        ]);

        const deckIds = (decksResponse.data || []).map((deck: { id: string }) => deck.id);
        let dueCount = 0;
        if (deckIds.length > 0) {
          const { data: cards } = await supabase
            .from('flashcards')
            .select('next_review_date')
            .in('deck_id', deckIds);
          const now = new Date();
          dueCount = (cards || []).filter((card: { next_review_date: string | null }) => {
            const nextReview = parseDateTime(card.next_review_date);
            return !nextReview || nextReview <= now;
          }).length;
        }
        setDueFlashcardCount(dueCount);

        // Preferred path: the Learning Spine knows which curriculum subtopics
        // are due and how weak they are, so the queue can name the actual gap
        // instead of a recurring phrase from a marking report.
        const dueSubtopics = await readDueSubtopics(supabase, userId, { limit: MAX_WEAK_TOPICS });

        // `?subtopic=` lets the planner (and any other surface) hand a student
        // straight to one gap. Read from location rather than useSearchParams so
        // this stays a plain effect -- the hook would force the whole page under
        // a Suspense boundary for one optional query string. The named subtopic
        // is deliberately allowed even when it is not due: the student picked it.
        const requestedSubtopicId =
          new URLSearchParams(window.location.search).get('subtopic') ?? '';
        let targets = dueSubtopics;
        if (requestedSubtopicId) {
          const requested = (await readStudentMastery(supabase, userId)).find(
            (row) => row.subtopicId === requestedSubtopicId
          );
          if (requested) {
            // Sliced back to the cap rather than appended: each target costs a
            // question-generation call, so the requested one should displace the
            // least urgent due item, not lengthen the queue.
            targets = [
              requested,
              ...dueSubtopics.filter((row) => row.subtopicId !== requestedSubtopicId),
            ].slice(0, MAX_WEAK_TOPICS);
          }
        }

        if (targets.length > 0) {
          setWeakTopics(
            targets.map((row) => ({
              tag: row.subtopicName,
              count: row.state.evidenceCount,
              subject: row.scope.subject,
              examBoard: row.scope.examBoard,
              examType: row.scope.examType,
              specName: row.scope.specName,
              specTier: row.scope.specTier,
              subtopicId: row.subtopicId,
              topicName: row.topicName,
              subtopicName: row.subtopicName,
              band: row.band,
            }))
          );
          return;
        }

        // Fallback for students with no spine evidence yet -- and permanently
        // for subjects with no DB curriculum (English Literature), which can
        // never produce a subtopic id.
        type AttemptRow = { subject: string; weakness_tags?: string[] | null; weakness_analysis?: string[] | null };
        const attempts = (attemptsResponse.data || []) as AttemptRow[];
        const tagMap = new Map<string, { count: number; subjects: Set<string> }>();
        for (const attempt of attempts) {
          const rawInsights = (attempt.weakness_tags?.length ? attempt.weakness_tags : attempt.weakness_analysis) ?? [];
          for (const tag of rawInsights) {
            const norm = normalizeInsightLabel(tag);
            if (!norm) continue;
            const entry = tagMap.get(norm) ?? { count: 0, subjects: new Set<string>() };
            entry.count += 1;
            entry.subjects.add(attempt.subject);
            tagMap.set(norm, entry);
          }
        }

        const ranked = [...tagMap.entries()].sort((a, b) => b[1].count - a[1].count);
        const summarized: WeakTopicSummary[] = [];
        for (const [tag, { count, subjects }] of ranked) {
          if (summarized.length >= MAX_WEAK_TOPICS) break;
          const matchedSubject = userSubjects.find((s) => subjects.has(s.subject) && s.exam_board && s.exam_type);
          if (!matchedSubject) continue;
          summarized.push({
            tag,
            count,
            subject: matchedSubject.subject,
            examBoard: matchedSubject.exam_board,
            examType: matchedSubject.exam_type,
            specName: matchedSubject.spec_name ?? null,
            specTier: matchedSubject.spec_tier ?? null,
          });
        }
        setWeakTopics(summarized);
      } catch (err) {
        console.error('Failed to load daily review summary', err);
      } finally {
        setIsLoadingSummary(false);
      }
    };

    void loadSummary();
  }, [userId, userSubjects]);

  /**
   * Server-stored question for a subtopic the spine knows about.
   *
   * Preferred over the generic generator because the server keeps the question
   * and marks the answer itself, which is the only way answering it can count
   * as mastery evidence -- the browser is handed the answer key to render the
   * reveal panel, so it cannot be trusted to report its own score.
   */
  const generateAdjudicatedQuestion = async (topic: WeakTopicSummary): Promise<QueueItem | null> => {
    try {
      const response = await fetch('/api/review-queue/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtopicId: topic.subtopicId }),
      });
      if (!response.ok) return null;
      const body = await response.json();
      const question = body.question as
        | { question: string; options: string[]; correctOption: 'A' | 'B' | 'C' | 'D'; explanation: string }
        | undefined;
      if (!body.itemId || !question) return null;

      const optionText = question.options[['A', 'B', 'C', 'D'].indexOf(question.correctOption)];
      return {
        kind: 'microquestion',
        id: `queue-${body.itemId}`,
        itemId: body.itemId,
        front: question.question,
        back: [
          `**Correct answer: ${question.correctOption}**${optionText ? ` — ${optionText}` : ''}`,
          question.explanation,
        ]
          .filter(Boolean)
          .join('\n\n'),
        weaknessTag: topic.tag,
        subjectLabel: getSubjectLabel(topic.subject),
        questionType: 'mcq',
        options: question.options,
        correctOption: question.correctOption,
      };
    } catch (err) {
      console.error('Adjudicated question generation failed', err);
      return null;
    }
  };

  const generateMicroQuestion = async (topic: WeakTopicSummary): Promise<QueueItem | null> => {
    // Spine-backed targets go through the adjudicated path so the answer counts.
    if (topic.subtopicId) {
      const adjudicated = await generateAdjudicatedQuestion(topic);
      if (adjudicated) return adjudicated;
      // Fall through on failure: a throwaway question still beats a gap in the
      // queue, it just will not produce evidence.
    }

    try {
      const specification = topic.specName ? `${topic.specName}${topic.specTier ? ` - ${topic.specTier}` : ''}` : '';
      const response = await fetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: topic.subject,
          examBoard: topic.examBoard,
          examType: topic.examType,
          specification,
          // With spine data the question is scoped by real curriculum ids, so
          // the model gets the topic and subtopic rather than a phrase lifted
          // out of a marking report.
          ...(topic.topicName ? { topic: topic.topicName, subtopic: topic.subtopicName } : {}),
          prompt: topic.topicName
            ? `The student is weak on this subtopic. Write one quick, focused retrieval-practice question that directly targets it.`
            : `Focus tightly on this specific recurring weakness the student has: "${topic.tag}". Write one quick, focused retrieval-practice question that directly targets fixing it.`,
          questionCount: 1,
          allowMcq: true,
          allowCalculation: false,
          allowPlot: false,
          useOnlineResources: false,
        }),
      });
      const body = await response.json();
      if (!response.ok) return null;
      const question: ExamQuestion | undefined = Array.isArray(body.questions) ? body.questions[0] : undefined;
      if (!question) return null;
      return {
        kind: 'microquestion',
        id: `micro-${topic.tag}-${Math.random().toString(36).slice(2)}`,
        front: question.question,
        back: buildMicroQuestionBack(question),
        weaknessTag: topic.tag,
        subjectLabel: getSubjectLabel(topic.subject),
        questionType: question.questionType,
        options: question.options ?? [],
        correctOption: question.correctOption,
      };
    } catch (err) {
      console.error('Micro-question generation failed', err);
      return null;
    }
  };

  const handleStart = async () => {
    if (!userId) return;
    setPhase('loading');
    try {
      const supabase = createClient();
      const { data: decks } = await supabase.from('flashcard_decks').select('id').eq('user_id', userId);
      const deckIds = (decks || []).map((deck: { id: string }) => deck.id);

      let dueFlashcards: Flashcard[] = [];
      if (deckIds.length > 0) {
        const { data: cards, error } = await supabase
          .from('flashcards')
          .select('*')
          .in('deck_id', deckIds)
          .order('next_review_date', { ascending: true });
        if (error) throw error;
        const now = new Date();
        dueFlashcards = ((cards || []) as Flashcard[])
          .filter((card) => {
            const nextReview = parseDateTime(card.next_review_date);
            return !nextReview || nextReview <= now;
          })
          .slice(0, MAX_DUE_FLASHCARDS);
      }

      const flashcardItems: QueueItem[] = dueFlashcards.map((card) => ({
        kind: 'flashcard',
        id: card.id,
        front: card.front,
        back: card.back,
        card,
      }));

      const microQuestionResults = await Promise.all(weakTopics.map((topic) => generateMicroQuestion(topic)));
      const microItems = microQuestionResults.filter((item): item is QueueItem => item !== null);

      const combined = interleaveQueue(flashcardItems, microItems);
      if (combined.length === 0) {
        showToast('info', 'Nothing to review right now — check back once cards are due or after your next practice attempt.');
        setPhase('idle');
        return;
      }

      deckCountsRef.current = new Map();
      microStatsRef.current = { attempted: 0, correct: 0 };
      sessionStartedAtRef.current = new Date();
      setQueue(combined);
      setCurrentIndex(0);
      setShowBack(false);
      setSelectedOption('');
      setSummary(null);
      setPhase('reviewing');
    } catch (err) {
      console.error('Failed to start daily review', err);
      showToast('error', 'Could not start the daily review. Try again in a moment.');
      setPhase('idle');
    }
  };

  const currentItem = queue[currentIndex];
  const isMcqItem =
    currentItem?.kind === 'microquestion' && currentItem.questionType === 'mcq' && currentItem.options.length > 0;

  const flashcardPreviews = useMemo(() => {
    if (!currentItem || currentItem.kind !== 'flashcard' || !showBack) return null;
    const card = currentItem.card;
    const prev = {
      ease_factor: card.ease_factor || 2.5,
      interval_days: card.interval_days || 0,
      repetition_count: card.repetition_count || 0,
      consecutive_correct: card.consecutive_correct || 0,
      last_studied_at: card.last_studied_at || null,
      next_review_date: card.next_review_date || null,
      times_studied: card.times_studied || 0,
      times_correct: card.times_correct || 0,
    };
    return REVIEW_GRADES.map(({ label, quality, tone, key }) => ({
      label,
      quality,
      color: tone,
      shortcut: key,
      subtext: formatInterval(previewNextReview(prev, quality).interval_days),
    }));
  }, [currentItem, showBack]);

  const microSubtext = ['Got it wrong', 'Struggled', 'Got it right', 'Knew it cold'];
  const gradeButtons = flashcardPreviews ?? REVIEW_GRADES.map(({ label, quality, tone, key }) => ({
    label,
    quality,
    color: tone,
    shortcut: key,
    subtext: microSubtext[quality],
  }));

  const finishReview = async () => {
    if (userId) {
      const supabase = createClient();
      const endedAt = new Date();
      const startedAt = sessionStartedAtRef.current ?? endedAt;
      const durationMinutes = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
      const entries = [...deckCountsRef.current.entries()];
      await Promise.all(
        entries.map(([deckId, count]) =>
          supabase.from('study_sessions').insert({
            user_id: userId,
            deck_id: deckId,
            started_at: startedAt.toISOString(),
            ended_at: endedAt.toISOString(),
            duration_minutes: durationMinutes,
            cards_studied: count,
          })
        )
      );
    }

    setSummary({
      flashcardsStudied: [...deckCountsRef.current.values()].reduce((sum, count) => sum + count, 0),
      microAttempted: microStatsRef.current.attempted,
      microCorrect: microStatsRef.current.correct,
    });
    setPhase('summary');
  };

  const handleGrade = async (quality: number) => {
    const item = queue[currentIndex];
    if (!item) return;

    if (item.kind === 'flashcard') {
      const card = item.card;
      // Graded server-side so the review can also emit Learning Spine evidence,
      // which needs the service role the browser client does not have.
      await fetch('/api/flashcards/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: card.id, quality }),
      });
      deckCountsRef.current.set(card.deck_id, (deckCountsRef.current.get(card.deck_id) || 0) + 1);
    } else {
      // Only server-stored questions produce evidence. The server re-marks the
      // selection against the question it saved, so `quality` here stays purely
      // a local display stat.
      if (item.itemId && selectedOption) {
        await fetch('/api/review-queue/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: item.itemId, selectedOption }),
        });
      }
      microStatsRef.current = {
        attempted: microStatsRef.current.attempted + 1,
        correct: microStatsRef.current.correct + (quality >= 2 ? 1 : 0),
      };
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) {
      await finishReview();
    } else {
      setCurrentIndex(nextIndex);
      setShowBack(false);
      setSelectedOption('');
    }
  };

  const handleSelectOption = (letter: 'A' | 'B' | 'C' | 'D') => {
    if (selectedOption) return;
    setSelectedOption(letter);
    setShowBack(true);
  };

  const handleMcqContinue = () => {
    if (!currentItem || currentItem.kind !== 'microquestion') return;
    const isCorrect = selectedOption === currentItem.correctOption;
    void handleGrade(isCorrect ? 2 : 0);
  };

  useReviewShortcuts({
    enabled: phase === 'reviewing' && !!currentItem && !isMcqItem,
    isAnswerShown: showBack,
    onReveal: () => setShowBack(true),
    onGrade: handleGrade,
  });

  const resetToIdle = () => {
    setPhase('idle');
    setQueue([]);
    setCurrentIndex(0);
    setShowBack(false);
    setSelectedOption('');
  };

  return (
    <div className="space-y-6" aria-labelledby="daily-review-title">
      <PageHero
        icon={ListChecks}
        titleId="daily-review-title"
        title="Daily Review"
        description="One mixed queue: your due flashcards interleaved with quick questions targeting your recurring weak spots."
        actions={
          <>
            <Link href="/dashboard/study-sessions" className={buttonStyles({ variant: 'secondary' })}>Flashcard Revision</Link>
            <Link href="/dashboard/ai-questions" className={buttonStyles({ variant: 'secondary' })}>Smart Practice</Link>
          </>
        }
      />

      {phase === 'idle' && (
        <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-card">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-subtle p-4">
              <p className="text-sm font-medium text-content-muted">Flashcards due</p>
              <p className="mt-2 text-3xl font-bold text-content">{isLoadingSummary ? '…' : dueFlashcardCount}</p>
            </div>
            <div className="rounded-xl border border-subtle p-4">
              <p className="text-sm font-medium text-content-muted">Weak spots targeted</p>
              <p className="mt-2 text-3xl font-bold text-content">{isLoadingSummary ? '…' : weakTopics.length}</p>
            </div>
          </div>

          {weakTopics.length > 0 ? (
            <ul className="mt-5 space-y-2">
              {weakTopics.map((topic) => (
                <li
                  key={topic.tag}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-subtle px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-content">
                      <Target className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="truncate">{topic.tag}</span>
                    </p>
                    {topic.topicName ? (
                      <p className="mt-0.5 truncate text-caption text-content-subtle">
                        {getSubjectLabel(topic.subject)} · {topic.topicName}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* masteryBand already returns 'unknown' below the confidence
                        floor, so there is no threshold to re-check here. */}
                    {topic.band ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${masteryBadgeTone(topic.band)}`}
                      >
                        {MASTERY_LABEL[topic.band]}
                      </span>
                    ) : null}
                    <Link
                      href={`/dashboard/ai-questions?${new URLSearchParams({
                        topic: topic.topicName ?? topic.tag,
                        ...(topic.subtopicName ? { subtopic: topic.subtopicName } : {}),
                      })}`}
                      className={buttonStyles({ variant: 'ghost', size: 'chip' })}
                    >
                      Practise this
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-6">
            <button
              className={buttonStyles({ variant: 'primary', size: 'lg' })}
              onClick={handleStart}
              disabled={isLoadingSummary || (dueFlashcardCount === 0 && weakTopics.length === 0)}
            >
              <Sparkles className="h-4 w-4" />
              Start Daily Review
              <ArrowRight className="h-4 w-4" />
            </button>
            {!isLoadingSummary && dueFlashcardCount === 0 && weakTopics.length === 0 ? (
              <p className="mt-3 text-sm text-content-subtle">
                Nothing due right now. Come back once flashcards are due or after your next Smart Practice attempt.
              </p>
            ) : null}
          </div>
        </section>
      )}

      {phase === 'loading' && (
        <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-card">
          <style>{`@keyframes daily-review-loading{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
          <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-surface/10">
            <div className="h-full w-2/5 rounded-full bg-linear-to-r from-indigo-600 to-purple-500" style={{ animation: 'daily-review-loading 1.4s ease-in-out infinite' }} />
          </div>
          <p className="mt-3 text-sm text-content-muted">Building your review queue…</p>
        </section>
      )}

      {phase === 'reviewing' && currentItem && (
        <section className="space-y-5 rounded-2xl border border-subtle bg-surface p-6 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-accent">
                Item {currentIndex + 1} of {queue.length}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-content">
                {currentItem.kind === 'flashcard' ? 'Flashcard' : `Weak spot: ${currentItem.weaknessTag}`}
              </h2>
            </div>
            {currentItem.kind === 'microquestion' ? (
              <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/45 dark:text-indigo-300">
                {currentItem.subjectLabel}
              </span>
            ) : null}
          </div>

          <div className="rounded-lg border border-subtle bg-surface-sunken p-5 dark:bg-surface/3" aria-labelledby="current-item-heading">
            <p id="current-item-heading" className="text-xs font-semibold uppercase tracking-wide text-content-subtle">
              {currentItem.kind === 'flashcard' && hasCloze(currentItem.front)
                ? 'Fill the gap'
                : currentItem.kind === 'flashcard'
                ? 'Front'
                : 'Question'}
            </p>
            <MarkdownContent
              className="prose prose-sm mt-2 max-w-none text-content"
              content={hasCloze(currentItem.front) ? maskAllCloze(currentItem.front) : currentItem.front}
            />

            {isMcqItem && currentItem.kind === 'microquestion' ? (
              <div className="mt-5 grid gap-2" role="group" aria-label="Answer options">
                {currentItem.options.map((optionText, index) => {
                  const letter = (['A', 'B', 'C', 'D'] as const)[index];
                  if (!letter || !optionText) return null;
                  const isCorrectOption = letter === currentItem.correctOption;
                  const isSelected = letter === selectedOption;
                  const answered = !!selectedOption;
                  const stateClass = !answered
                    ? 'border-subtle hover:border-accent hover:bg-surface-sunken'
                    : isCorrectOption
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-200'
                    : isSelected
                    ? 'border-red-500 bg-red-50 text-red-900 dark:bg-red-950/35 dark:text-red-200'
                    : 'border-subtle opacity-60';
                  return (
                    <button
                      key={letter}
                      type="button"
                      className={`flex items-center gap-3 rounded-field border px-4 py-3 text-left text-body transition-colors ${stateClass}`}
                      onClick={() => handleSelectOption(letter)}
                      disabled={answered}
                      aria-pressed={isSelected}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-caption font-semibold">
                        {letter}
                      </span>
                      <MarkdownContent className="prose prose-sm max-w-none" content={optionText} />
                    </button>
                  );
                })}
              </div>
            ) : null}

            {showBack ? (
              <>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-content-subtle">
                  {currentItem.kind === 'flashcard' ? 'Back' : 'Answer'}
                </p>
                <MarkdownContent
                  className="prose prose-sm mt-2 max-w-none text-content-muted dark:text-slate-200"
                  content={hasCloze(currentItem.front) ? revealAllCloze(currentItem.front) : currentItem.back}
                />
              </>
            ) : !isMcqItem ? (
              <button
                className={buttonStyles({ variant: 'primary', className: 'mt-5' })}
                onClick={() => setShowBack(true)}
                aria-label="Reveal answer"
                aria-keyshortcuts="Space Enter"
              >
                Show answer
                <kbd className="rounded border border-white/30 px-1.5 py-0.5 text-[10px] font-semibold">Space</kbd>
              </button>
            ) : null}
          </div>

          {showBack && isMcqItem && (
            <div className="space-y-3">
              <button className={buttonStyles({ variant: 'primary' })} onClick={handleMcqContinue}>
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {showBack && !isMcqItem && (
            <div className="space-y-3" role="group" aria-labelledby="recall-rating-label">
              <p id="recall-rating-label" className="text-body font-medium text-content-muted">
                Rate your recall
              </p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {gradeButtons.map(({ label, quality, color, shortcut, subtext }) => (
                  <button
                    key={quality}
                    className={buttonStyles({
                      variant: 'plain',
                      size: 'none',
                      className: `flex-col rounded-field border border-transparent px-4 py-3 shadow-card transition-all hover:brightness-110 hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${color}`,
                    })}
                    onClick={() => handleGrade(quality)}
                    aria-label={`${label}: ${subtext}`}
                    aria-keyshortcuts={shortcut}
                  >
                    <span className="flex items-center gap-1.5 text-body font-semibold">
                      {label}
                      <kbd className="rounded border border-white/35 px-1 text-[10px] font-semibold opacity-90">{shortcut}</kbd>
                    </span>
                    <span className="block text-caption opacity-90">{subtext}</span>
                  </button>
                ))}
              </div>
              <p className="text-caption text-content-subtle">
                Keyboard: <kbd className="rounded bg-surface-sunken px-1">Space</kbd> reveal or Good ·{' '}
                <kbd className="rounded bg-surface-sunken px-1">1</kbd>–<kbd className="rounded bg-surface-sunken px-1">4</kbd> to grade
              </p>
            </div>
          )}
        </section>
      )}

      {phase === 'summary' && summary && (
        <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-card">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-emerald-100 dark:bg-emerald-500/15 p-3 text-emerald-600 dark:text-emerald-400">
              <RotateCcw className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-content">Review complete</h2>
              <p className="mt-1 text-sm text-content-muted">
                {summary.flashcardsStudied} flashcard{summary.flashcardsStudied === 1 ? '' : 's'} reviewed
                {summary.microAttempted > 0
                  ? ` · ${summary.microCorrect}/${summary.microAttempted} weak-spot questions right`
                  : ''}.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className={buttonStyles({ variant: 'primary' })} onClick={resetToIdle}>
              Back to Daily Review
            </button>
            <Link href="/dashboard" className={buttonStyles({ variant: 'secondary' })}>
              Dashboard
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
