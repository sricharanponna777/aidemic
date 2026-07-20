'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Brain, Clock3, Layers, Play, Rocket, RotateCcw, ShieldPlus } from 'lucide-react';
import { StudySession, FlashcardDeck, Flashcard } from '@/types';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase-client';
import { updateSpacedRepetition, formatInterval, previewNextReview } from '@/lib/spacedRepetition';
import { useAuth } from '@/hooks/useAuth';
import { MarkdownContent } from '@/components/MarkdownContent';
import { buttonStyles } from '@/components/ui/button';
import { RevisionCycleStepper } from '@/components/RevisionCycleStepper';

type Session = Pick<
  StudySession,
  | 'id'
  | 'deck_id'
  | 'started_at'
  | 'ended_at'
  | 'duration_minutes'
  | 'cards_studied'
  | 'difficulty_level'
  | 'ai_recommendations'
> & { deck_name: string };

type DeckOption = FlashcardDeck & { due_count?: number };
type SessionRow = StudySession & {
  flashcard_decks?: { name?: string } | Array<{ name?: string }> | null;
};
type DueCardRow = Pick<Flashcard, 'deck_id' | 'next_review_date'>;

type Notice = {
  tone: 'success' | 'warning' | 'error';
  text: string;
};

const getDeckName = (value: unknown) => {
  const relation = value as { flashcard_decks?: { name?: string } | Array<{ name?: string }> };
  if (Array.isArray(relation.flashcard_decks)) {
    return relation.flashcard_decks[0]?.name || 'Unknown deck';
  }
  return relation.flashcard_decks?.name || 'Unknown deck';
};

const parseDateTime = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateValue = (value?: string | null) => parseDateTime(value)?.getTime() ?? 0;

const formatSessionDate = (value?: string | null) => {
  const date = parseDateTime(value);
  if (!date) return 'Unknown date';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const formatMinutes = (minutes?: number) => {
  const safeMinutes = Math.max(0, minutes || 0);
  if (safeMinutes < 60) return `${safeMinutes}m`;
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
};

export default function StudySessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [phase, setPhase] = useState<'idle' | 'choosing' | 'reviewing'>('idle');
  const [deckList, setDeckList] = useState<DeckOption[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [cardsToReview, setCardsToReview] = useState<Flashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<Date | null>(null);
  const [cardsStudied, setCardsStudied] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const didApplyDeckParam = useRef(false);
  const { session } = useAuth();
  const userId = session?.user?.id;

  const loadSessions = useCallback(async () => {
    if (!userId) {
      return;
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('study_sessions')
        .select('*, flashcard_decks(name)')
        .eq('user_id', userId)
        .order('started_at', { ascending: false });

      if (error) {
        console.error('Error loading sessions:', error.message);
        setNotice({ tone: 'error', text: 'Unable to load recent Flashcard reviews.' });
      } else {
        const sessionRows = (data || []) as SessionRow[];
        const mapped: Session[] = sessionRows.map((item) => ({
          id: item.id,
          deck_id: item.deck_id,
          deck_name: getDeckName(item),
          started_at: item.started_at || '',
          ended_at: item.ended_at || '',
          duration_minutes: item.duration_minutes || 0,
          cards_studied: item.cards_studied || 0,
          difficulty_level: item.difficulty_level || '',
          ai_recommendations: item.ai_recommendations || '',
        }));
        setSessions(mapped);
      }
    } catch (err) {
      console.error('Unexpected error loading sessions', err);
      setNotice({ tone: 'error', text: 'Unable to load recent Flashcard reviews.' });
    }
  }, [userId]);

  const loadDecks = useCallback(async () => {
    if (!userId) {
      return;
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('flashcard_decks')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true });

      if (error) {
        console.error('error loading decks', error.message);
        setNotice({ tone: 'error', text: 'Unable to load decks.' });
        return;
      }

      const decks = (data || []) as DeckOption[];
      const deckIds = decks.map((deck) => deck.id);
      const dueCounts = new Map<string, number>();

      if (deckIds.length > 0) {
        const { data: cards, error: cardError } = await supabase
          .from('flashcards')
          .select('deck_id, next_review_date')
          .in('deck_id', deckIds);

        if (cardError) {
          console.error('error loading due card counts', cardError.message);
        } else {
          const now = new Date();
          const cardRows = (cards || []) as DueCardRow[];
          cardRows.forEach((card) => {
            const nextReview = parseDateTime(card.next_review_date);
            if (!nextReview || nextReview <= now) {
              dueCounts.set(card.deck_id, (dueCounts.get(card.deck_id) || 0) + 1);
            }
          });
        }
      }

      setDeckList(decks.map((deck) => ({ ...deck, due_count: dueCounts.get(deck.id) || 0 })));
    } catch (err) {
      console.error('unexpected deck fetch error', err);
      setNotice({ tone: 'error', text: 'Unable to load decks.' });
    }
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSessions();
      void loadDecks();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSessions, loadDecks]);

  useEffect(() => {
    if (didApplyDeckParam.current) return;
    const deckId = new URLSearchParams(window.location.search).get('deckId');
    if (!deckId || deckList.length === 0) return;
    if (!deckList.some((deck) => deck.id === deckId)) return;
    didApplyDeckParam.current = true;
    const timer = window.setTimeout(() => {
      setSelectedDeckId(deckId);
      setPhase('choosing');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [deckList]);

  const orderedDeckList = useMemo(() => {
    return [...deckList].sort((a, b) => {
      const dueDiff = (b.due_count || 0) - (a.due_count || 0);
      if (dueDiff !== 0) return dueDiff;
      return a.name.localeCompare(b.name);
    });
  }, [deckList]);

  const selectedDeck = useMemo(
    () => orderedDeckList.find((deck) => deck.id === selectedDeckId) || null,
    [orderedDeckList, selectedDeckId]
  );

  const sessionSummary = useMemo(() => {
    return {
      completed: sessions.length,
      totalCards: sessions.reduce((sum, item) => sum + (item.cards_studied || 0), 0),
      totalMinutes: sessions.reduce((sum, item) => sum + (item.duration_minutes || 0), 0),
    };
  }, [sessions]);

  const currentCard = cardsToReview[currentCardIndex];

  const reviewPreviews = useMemo<
    { label: string; quality: number; color: string; interval_days: number; next_review_date: string }[]
  >(() => {
    if (!currentCard || !showBack) return [];

    const prev = {
      ease_factor: currentCard.ease_factor || 2.5,
      interval_days: currentCard.interval_days || 0,
      repetition_count: currentCard.repetition_count || 0,
      consecutive_correct: currentCard.consecutive_correct || 0,
      last_studied_at: currentCard.last_studied_at || null,
      next_review_date: currentCard.next_review_date || null,
      times_studied: currentCard.times_studied || 0,
      times_correct: currentCard.times_correct || 0,
    };

    return [
      { label: 'Again', quality: 0, color: 'bg-red-600 hover:bg-red-700' },
      { label: 'Hard', quality: 1, color: 'bg-orange-600 hover:bg-orange-700' },
      { label: 'Good', quality: 2, color: 'bg-blue-600 hover:bg-blue-700' },
      { label: 'Easy', quality: 3, color: 'bg-green-600 hover:bg-green-700' },
    ].map(({ label, quality, color }) => {
      const preview = previewNextReview(prev, quality);
      return {
        label,
        quality,
        color,
        interval_days: preview.interval_days,
        next_review_date: preview.next_review_date,
      };
    });
  }, [currentCard, showBack]);

  const handleStartSession = async () => {
    if (!selectedDeckId) return;

    setNotice(null);
    setSessionStartedAt(new Date());

    const supabase = createClient();
    const { data: cards, error } = await supabase
      .from('flashcards')
      .select('*')
      .eq('deck_id', selectedDeckId)
      .order('next_review_date', { ascending: true });

    if (error) {
      console.error('error fetching cards', error.message);
      setNotice({ tone: 'error', text: 'Unable to fetch cards for this deck.' });
      return;
    }

    const cardRows = (cards || []) as Flashcard[];
    const now = new Date();
    const due = cardRows
      .filter((card) => {
        const nextReview = parseDateTime(card.next_review_date);
        return !nextReview || nextReview <= now;
      })
      .sort((a, b) => dateValue(a.next_review_date) - dateValue(b.next_review_date));

    if (due.length === 0) {
      setNotice({ tone: 'warning', text: 'No cards are due in that deck. Choose another deck or come back later.' });
      setPhase('choosing');
      return;
    }

    setCardsToReview(due);
    setCurrentCardIndex(0);
    setShowBack(false);
    setCardsStudied(0);
    setPhase('reviewing');
  };

  const finishSession = async ({
    finalCardsStudied = cardsStudied,
  }: {
    finalCardsStudied?: number;
  } = {}) => {
    if (!session?.user?.id) {
      setNotice({ tone: 'error', text: 'Unable to save session because you are not signed in.' });
      return;
    }

    const endedAt = new Date();
    const elapsedMinutes = (endedAt.getTime() - (sessionStartedAt?.getTime() || endedAt.getTime())) / 60000;
    const durationMinutes = finalCardsStudied > 0 ? Math.max(1, Math.round(elapsedMinutes || 0)) : 0;

    const supabase = createClient();
    const { error: sessionError } = await supabase
      .from('study_sessions')
      .insert([
        {
          user_id: session.user.id,
          deck_id: selectedDeckId,
          started_at: sessionStartedAt?.toISOString(),
          ended_at: endedAt.toISOString(),
          duration_minutes: durationMinutes,
          cards_studied: finalCardsStudied,
        },
      ])
      .select()
      .single();

    if (sessionError) {
      console.error('session insert error', sessionError.message);
      setNotice({ tone: 'error', text: 'Unable to save this study session.' });
      return;
    }

    await Promise.all([loadSessions(), loadDecks()]);
    setNotice({
      tone: 'success',
      text: `Session saved: ${finalCardsStudied} cards reviewed.`,
    });
    setPhase('idle');
    setSelectedDeckId('');
    setCardsToReview([]);
    setCurrentCardIndex(0);
    setShowBack(false);
    setSessionStartedAt(null);
    setCardsStudied(0);
  };

  const handleGrade = async (quality: number) => {
    const card = cardsToReview[currentCardIndex];
    if (!card) return;

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
    await supabase.from('flashcards').update(updated).eq('id', card.id).eq('deck_id', selectedDeckId);

    setCardsToReview((prevCards) =>
      prevCards.map((item, index) => (index === currentCardIndex ? { ...item, ...updated } : item))
    );

    const nextCardsStudied = cardsStudied + 1;
    const nextIndex = currentCardIndex + 1;

    setCardsStudied(nextCardsStudied);

    if (nextIndex < cardsToReview.length) {
      setCurrentCardIndex(nextIndex);
      setShowBack(false);
    } else {
      await finishSession({
        finalCardsStudied: nextCardsStudied,
      });
    }
  };

  const noticeClassName = notice
    ? {
        success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-950/35 dark:text-emerald-200',
        warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/35 dark:text-amber-200',
        error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-700/70 dark:bg-red-950/35 dark:text-red-200',
      }[notice.tone]
    : '';

  return (
    <main className="space-y-6" aria-labelledby="study-sessions-title">
      <RevisionCycleStepper current="recall" />

      <section className="rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-6 shadow-sm dark:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">Step 4 of 5</p>
            <div className="mt-2 flex items-center gap-3">
              <Brain className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
              <h1 id="study-sessions-title" className="text-3xl font-bold text-slate-900 dark:text-white">Flashcard Revision</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              Review your flashcards with spaced repetition.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/flashcards"
              className={buttonStyles({ variant: 'secondary' })}
            >
              <ArrowLeft className="h-4 w-4" />
              Flashcards
            </Link>
            <Link
              href="/dashboard/ai-questions"
              className={buttonStyles({
                variant: 'primary',
                size: 'lg',
                className: 'shadow-lg shadow-indigo-500/25 hover:-translate-y-px hover:shadow-indigo-500/35',
              })}
            >
              <Rocket className="h-4 w-4" />
              Smart Practice
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section aria-label="Study overview" className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-5 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Sessions completed</p>
            <Brain className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{sessionSummary.completed}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatMinutes(sessionSummary.totalMinutes)} total study time</p>
        </article>
        <article className="rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-5 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Cards studied</p>
            <Layers className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{sessionSummary.totalCards}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">from saved sessions</p>
        </article>
      </section>

      {notice ? <div className={`rounded-lg border px-4 py-3 text-sm ${noticeClassName}`}>{notice.text}</div> : null}

      {phase === 'idle' && (
        <section className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
          <div className="rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-6 shadow-sm dark:shadow-none">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-indigo-100 dark:bg-indigo-500/15 p-3 text-indigo-600 dark:text-indigo-400">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Ready cards first</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Decks with due cards appear first, so the next session starts in the right place.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                className={buttonStyles({ variant: 'primary' })}
                onClick={() => setPhase('choosing')}
              >
                Start new session
                <ArrowRight className="h-4 w-4" />
              </button>
              {deckList.length === 0 ? (
                <Link href="/dashboard/flashcards" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
                  Create a deck
                </Link>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-6 shadow-sm dark:shadow-none">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Deck order</h2>
            <div className="mt-4 space-y-2">
              {orderedDeckList.slice(0, 4).map((deck) => (
                <div key={deck.id} className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/6 px-3 py-2">
                  <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{deck.name}</span>
                  <span className="ml-3 shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                    {deck.due_count || 0} due
                  </span>
                </div>
              ))}
              {orderedDeckList.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/6 dark:bg-white/3 dark:text-slate-300">
                  No decks yet.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      )}

      {phase === 'choosing' && (
        <section className="rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-6 shadow-sm dark:shadow-none">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Select a deck</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Decks with due cards are listed first.</p>
          <label htmlFor="deck-select" className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Deck
          </label>
          <select
            id="deck-select"
            aria-label="Choose the deck to review"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-slate-900 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
            value={selectedDeckId}
            onChange={(event) => setSelectedDeckId(event.target.value)}
          >
            <option value="">Pick a deck</option>
            {orderedDeckList.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name} - {deck.due_count || 0} due / {deck.card_count || 0} cards
              </option>
            ))}
          </select>

          {selectedDeck ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/6 dark:bg-white/3">
              <p className="font-semibold text-slate-900 dark:text-slate-100">{selectedDeck.name}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {selectedDeck.due_count || 0} cards due from {selectedDeck.card_count || 0} total cards.
              </p>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              className={buttonStyles({ variant: 'primary' })}
              onClick={handleStartSession}
              disabled={!selectedDeckId}
            >
              <Play className="h-4 w-4" />
              Begin review
            </button>
            <button
              className={buttonStyles({ variant: 'secondary' })}
              onClick={() => setPhase('idle')}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {phase === 'reviewing' && currentCard && (
        <section className="space-y-5 rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-6 shadow-sm dark:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-600 dark:text-indigo-400">Now reviewing</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                {selectedDeck?.name || 'Selected deck'}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Card {currentCardIndex + 1} of {cardsToReview.length}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-white/6 dark:bg-white/3" aria-labelledby="current-card-heading">
            <p id="current-card-heading" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Front
            </p>
            <MarkdownContent
              className="prose prose-sm mt-2 max-w-none text-slate-900 dark:text-slate-100"
              content={currentCard.front}
            />

            {showBack ? (
              <>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Back</p>
                <MarkdownContent
                  className="prose prose-sm mt-2 max-w-none text-slate-800 dark:text-slate-200"
                  content={currentCard.back}
                />
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
                {reviewPreviews.map(({ label, quality, color, interval_days }) => (
                  <button
                    key={quality}
                    className={buttonStyles({
                      variant: 'plain',
                      size: 'none',
                      className: `rounded-lg border border-transparent px-4 py-3 text-white ${color}`,
                    })}
                    onClick={() => handleGrade(quality)}
                    aria-label={`${label}: review in ${formatInterval(interval_days)}`}
                  >
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block text-xs opacity-90">{formatInterval(interval_days)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-6 shadow-sm dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Session history</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Newest sessions are shown first.</p>
          </div>
          <Clock3 className="h-5 w-5 text-slate-400" />
        </div>

        <div className="mt-5 space-y-3">
          {sessions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/6 dark:bg-white/3 dark:text-slate-300">
              No saved Flashcard reviews yet.
            </p>
          ) : null}

          {sessions.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 dark:border-white/6 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">{item.deck_name}</h3>
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatSessionDate(item.started_at)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-right text-sm">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{item.cards_studied || 0}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">cards</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{formatMinutes(item.duration_minutes)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">time</p>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
