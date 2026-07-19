'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ListChecks, RotateCcw, Sparkles, Target } from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserSubjects } from '@/hooks/useUserSubjects';
import { useToast } from '@/components/ToastProvider';
import { createClient } from '@/lib/supabase-client';
import { formatInterval, previewNextReview, updateSpacedRepetition } from '@/lib/spacedRepetition';
import { getSubjectLabel } from '@/lib/ai/subjectConfig';
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
  | { kind: 'microquestion'; id: string; front: string; back: string; weaknessTag: string; subjectLabel: string };

type WeakTopicSummary = {
  tag: string;
  count: number;
  subject: string;
  examBoard: string;
  examType: string;
  specName: string | null;
  specTier: string | null;
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

  const generateMicroQuestion = async (topic: WeakTopicSummary): Promise<QueueItem | null> => {
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
          prompt: `Focus tightly on this specific recurring weakness the student has: "${topic.tag}". Write one quick, focused retrieval-practice question that directly targets fixing it.`,
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
      setSummary(null);
      setPhase('reviewing');
    } catch (err) {
      console.error('Failed to start daily review', err);
      showToast('error', 'Could not start the daily review. Try again in a moment.');
      setPhase('idle');
    }
  };

  const currentItem = queue[currentIndex];

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
    return [
      { label: 'Again', quality: 0, color: 'bg-red-600 hover:bg-red-700' },
      { label: 'Hard', quality: 1, color: 'bg-orange-600 hover:bg-orange-700' },
      { label: 'Good', quality: 2, color: 'bg-blue-600 hover:bg-blue-700' },
      { label: 'Easy', quality: 3, color: 'bg-green-600 hover:bg-green-700' },
    ].map(({ label, quality, color }) => ({
      label,
      quality,
      color,
      subtext: formatInterval(previewNextReview(prev, quality).interval_days),
    }));
  }, [currentItem, showBack]);

  const gradeButtons = flashcardPreviews ?? [
    { label: 'Again', quality: 0, color: 'bg-red-600 hover:bg-red-700', subtext: 'Got it wrong' },
    { label: 'Hard', quality: 1, color: 'bg-orange-600 hover:bg-orange-700', subtext: 'Struggled' },
    { label: 'Good', quality: 2, color: 'bg-blue-600 hover:bg-blue-700', subtext: 'Got it right' },
    { label: 'Easy', quality: 3, color: 'bg-green-600 hover:bg-green-700', subtext: 'Knew it cold' },
  ];

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
      const updated = updateSpacedRepetition(prev, quality);
      const supabase = createClient();
      await supabase.from('flashcards').update(updated).eq('id', card.id);
      deckCountsRef.current.set(card.deck_id, (deckCountsRef.current.get(card.deck_id) || 0) + 1);
    } else {
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
    }
  };

  const resetToIdle = () => {
    setPhase('idle');
    setQueue([]);
    setCurrentIndex(0);
    setShowBack(false);
  };

  return (
    <main className="space-y-6" aria-labelledby="daily-review-title">
      <section className="rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-6 shadow-sm dark:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">Daily practice</p>
            <div className="mt-2 flex items-center gap-3">
              <ListChecks className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
              <h1 id="daily-review-title" className="text-3xl font-bold text-slate-900 dark:text-white">Daily Review</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              One mixed queue: your due flashcards interleaved with quick questions targeting your recurring weak spots.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/study-sessions" className={buttonStyles({ variant: 'secondary' })}>Flashcard Revision</Link>
            <Link href="/dashboard/ai-questions" className={buttonStyles({ variant: 'secondary' })}>Smart Practice</Link>
          </div>
        </div>
      </section>

      {phase === 'idle' && (
        <section className="rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-6 shadow-sm dark:shadow-none">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 dark:border-white/6 p-4">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Flashcards due</p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">{isLoadingSummary ? '…' : dueFlashcardCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-white/6 p-4">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Weak spots targeted</p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">{isLoadingSummary ? '…' : weakTopics.length}</p>
            </div>
          </div>

          {weakTopics.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {weakTopics.map((topic) => (
                <span
                  key={topic.tag}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  <Target className="h-3.5 w-3.5" />
                  {topic.tag}
                </span>
              ))}
            </div>
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
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Nothing due right now. Come back once flashcards are due or after your next Smart Practice attempt.
              </p>
            ) : null}
          </div>
        </section>
      )}

      {phase === 'loading' && (
        <section className="rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-6 shadow-sm dark:shadow-none">
          <style>{`@keyframes daily-review-loading{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
          <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div className="h-full w-2/5 rounded-full bg-linear-to-r from-indigo-600 to-purple-500" style={{ animation: 'daily-review-loading 1.4s ease-in-out infinite' }} />
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Building your review queue…</p>
        </section>
      )}

      {phase === 'reviewing' && currentItem && (
        <section className="space-y-5 rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-6 shadow-sm dark:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-600 dark:text-indigo-400">
                Item {currentIndex + 1} of {queue.length}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                {currentItem.kind === 'flashcard' ? 'Flashcard' : `Weak spot: ${currentItem.weaknessTag}`}
              </h2>
            </div>
            {currentItem.kind === 'microquestion' ? (
              <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/45 dark:text-indigo-300">
                {currentItem.subjectLabel}
              </span>
            ) : null}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-white/6 dark:bg-white/3" aria-labelledby="current-item-heading">
            <p id="current-item-heading" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {currentItem.kind === 'flashcard' ? 'Front' : 'Question'}
            </p>
            <MarkdownContent className="prose prose-sm mt-2 max-w-none text-slate-900 dark:text-slate-100" content={currentItem.front} />

            {showBack ? (
              <>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {currentItem.kind === 'flashcard' ? 'Back' : 'Answer'}
                </p>
                <MarkdownContent className="prose prose-sm mt-2 max-w-none text-slate-800 dark:text-slate-200" content={currentItem.back} />
              </>
            ) : (
              <button
                className={buttonStyles({
                  variant: 'plain',
                  className: 'mt-5 border border-amber-300 bg-amber-300 text-slate-950 hover:border-amber-400 hover:bg-amber-400',
                })}
                onClick={() => setShowBack(true)}
                aria-label="Reveal answer"
              >
                Show answer
              </button>
            )}
          </div>

          {showBack && (
            <div className="space-y-3" role="group" aria-labelledby="recall-rating-label">
              <p id="recall-rating-label" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Rate your recall
              </p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {gradeButtons.map(({ label, quality, color, subtext }) => (
                  <button
                    key={quality}
                    className={buttonStyles({
                      variant: 'plain',
                      size: 'none',
                      className: `rounded-lg border border-transparent px-4 py-3 text-white ${color}`,
                    })}
                    onClick={() => handleGrade(quality)}
                    aria-label={`${label}: ${subtext}`}
                  >
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block text-xs opacity-90">{subtext}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {phase === 'summary' && summary && (
        <section className="rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-6 shadow-sm dark:shadow-none">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-emerald-100 dark:bg-emerald-500/15 p-3 text-emerald-600 dark:text-emerald-400">
              <RotateCcw className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Review complete</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
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
    </main>
  );
}
