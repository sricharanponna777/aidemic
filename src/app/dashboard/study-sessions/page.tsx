'use client';

import Link from 'next/link';
import { Brain, Clock3, Layers, Play, Radar, RotateCcw } from 'lucide-react';
import { StudySession, FlashcardDeck, Flashcard } from '@/types';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase-client';
import { formatInterval, previewNextReview } from '@/lib/spacedRepetition';
import { useAuth } from '@/hooks/useAuth';
import { MarkdownContent } from '@/components/MarkdownContent';
import { buttonStyles } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/feedback';
import { Alert, fieldStyles } from '@/components/ui/field';
import { Chip, Meter, MonoLabel, Panel, PanelHeading, Stat, StatusBar, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { REVIEW_GRADES, useReviewShortcuts } from '@/hooks/useReviewShortcuts';
import { hasCloze, maskAllCloze, revealAllCloze } from '@/lib/cloze';
import { isCardDue } from '@/lib/flashcardsDue';
// GAMIFICATION PAUSED: import { announceXp } from '@/lib/gamification/client';
import { mutate } from 'swr';

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
            if (isCardDue(card.next_review_date, now)) {
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

  // Cloze cards hide their {{c1::…}} deletions on the front and reveal them on
  // the back. Non-cloze cards render their front/back unchanged.
  const cardFace = useMemo(() => {
    if (!currentCard) return { isCloze: false, front: '', back: '' };
    if (hasCloze(currentCard.front)) {
      return {
        isCloze: true,
        front: maskAllCloze(currentCard.front),
        back: revealAllCloze(currentCard.front),
      };
    }
    return { isCloze: false, front: currentCard.front, back: currentCard.back };
  }, [currentCard]);

  const reviewPreviews = useMemo<
    { label: string; quality: number; color: string; shortcut: string; interval_days: number; next_review_date: string }[]
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

    return REVIEW_GRADES.map(({ label, quality, tone, key }) => {
      const preview = previewNextReview(prev, quality);
      return {
        label,
        quality,
        color: tone,
        shortcut: key,
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
      .filter((card) => isCardDue(card.next_review_date, now))
      .sort((a, b) => dateValue(a.next_review_date) - dateValue(b.next_review_date));

    if (due.length === 0) {
      // The deck's due count was stale. Refreshing it shows the "nothing due"
      // message under the deck picker and disables the button.
      await loadDecks();
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

    // Graded server-side so the review can also emit Learning Spine evidence,
    // which needs the service role the browser client does not have. The route
    // returns the SM-2 update it applied so local state stays in step.
    const response = await fetch('/api/flashcards/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: card.id, quality }),
    });
    const body = response.ok ? await response.json() : null;
    const updated = body?.update ?? null;
    // GAMIFICATION PAUSED: announceXp(body?.xp);
    void mutate((key) => Array.isArray(key) && key[0] === 'due-flashcards');

    if (updated) {
      setCardsToReview((prevCards) =>
        prevCards.map((item, index) => (index === currentCardIndex ? { ...item, ...updated } : item))
      );
    }

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

  useReviewShortcuts({
    enabled: phase === 'reviewing' && !!currentCard,
    isAnswerShown: showBack,
    onReveal: () => setShowBack(true),
    onGrade: handleGrade,
  });

  const totalDue = deckList.reduce((sum, deck) => sum + (deck.due_count || 0), 0);

  const reportColumn = (
    <>
      <PanelHeading icon={Radar} aside={phase === 'reviewing' ? <Chip tone="success">● Live session</Chip> : null}>
        Session report
      </PanelHeading>

      {phase === 'reviewing' ? (
        <>
          <Panel>
            <div className="flex items-baseline justify-between gap-2">
              <MonoLabel>Progress</MonoLabel>
              <span className="font-mono text-xs text-content-subtle">
                {currentCardIndex} / {cardsToReview.length}
              </span>
            </div>
            <Meter
              fraction={cardsToReview.length ? currentCardIndex / cardsToReview.length : 0}
              className="mt-3"
              label="Session progress"
            />
          </Panel>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Reviewed" value={cardsStudied} />
            <Stat label="Left" value={cardsToReview.length - currentCardIndex} />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Sessions" value={sessionSummary.completed} hint={`${formatMinutes(sessionSummary.totalMinutes)} studied`} />
          <Stat label="Cards studied" value={sessionSummary.totalCards} hint="from saved sessions" />
        </div>
      )}

      <Panel className="p-0">
        <div className="border-b border-subtle px-4 py-3">
          <PanelHeading icon={Clock3} as="h3">
            Session history
          </PanelHeading>
        </div>
        {sessions.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-content-subtle">No saved flashcard reviews yet.</p>
        ) : (
          <ul className="max-h-[28rem] divide-y divide-subtle overflow-y-auto">
            {sessions.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-content">{item.deck_name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-content-subtle">{formatSessionDate(item.started_at)}</p>
                </div>
                <div className="shrink-0 text-right font-mono text-xs text-content-muted">
                  <p>{item.cards_studied || 0} cards</p>
                  <p className="text-content-subtle">{formatMinutes(item.duration_minutes)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={Brain}
        eyebrow="Review / Spaced repetition"
        titleId="study-sessions-title"
        title="Flashcard Revision"
        description="Review one deck at a time. Each card comes back just before you are likely to forget it."
        actions={
          <>
            <Chip>● Mode: one deck</Chip>
            <Chip tone="warning">
              <Layers className="h-3 w-3" /> {totalDue} cards due
            </Chip>
            {phase === 'reviewing' && selectedDeck ? <Chip tone="success">{selectedDeck.name}</Chip> : null}
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        {notice ? (
          <div className="border-b border-subtle p-4">
            <Alert tone={notice.tone === 'error' ? 'danger' : notice.tone}>{notice.text}</Alert>
          </div>
        ) : null}

        {phase !== 'reviewing' && (
          <>
            <div className="space-y-3 border-b border-subtle p-5">
              <label className="block">
                <MonoLabel className="mb-1">Deck</MonoLabel>
                <select
                  id="deck-select"
                  aria-label="Choose the deck to review"
                  className={fieldStyles()}
                  value={selectedDeckId}
                  onChange={(event) => {
                    setSelectedDeckId(event.target.value);
                    if (event.target.value) setPhase('choosing');
                  }}
                >
                  <option value="">Pick a deck</option>
                  {orderedDeckList.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name} - {deck.due_count || 0} due / {deck.card_count || 0} cards
                    </option>
                  ))}
                </select>
              </label>
              {selectedDeck ? (
                <p className="font-mono text-xs text-content-muted">
                  {selectedDeck.name} · {selectedDeck.due_count || 0} due of {selectedDeck.card_count || 0} cards
                </p>
              ) : null}
              {selectedDeck && !selectedDeck.due_count ? (
                <Alert tone="warning">No cards are due in that deck. Choose another deck or come back later.</Alert>
              ) : null}
            </div>

            <div className="flex-1 p-5">
              <PanelHeading icon={RotateCcw} className="mb-1">
                Ready cards first
              </PanelHeading>
              <p className="mb-3 text-[13px] text-content-subtle">
                Decks with due cards appear first, so the next session starts in the right place.
              </p>
              {orderedDeckList.length === 0 ? (
                <p className="rounded-lg border border-dashed border-subtle bg-surface-sunken p-4 text-sm text-content-muted">
                  No decks yet.{' '}
                  <Link href="/dashboard/flashcards" className="font-semibold text-accent hover:underline">
                    Create a deck
                  </Link>
                </p>
              ) : (
                <ul className="space-y-2">
                  {orderedDeckList.map((deck) => (
                    <li
                      key={deck.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border bg-surface px-4 py-2.5 ${
                        deck.id === selectedDeckId ? 'border-accent' : 'border-subtle'
                      }`}
                    >
                      <span className="truncate text-sm font-medium text-content">{deck.name}</span>
                      <Chip tone={(deck.due_count || 0) > 0 ? 'warning' : 'neutral'}>{deck.due_count || 0} due</Chip>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle p-4">
              <div className="flex flex-wrap gap-4 font-mono text-xs text-content-subtle max-sm:hidden">
                <Link href="/dashboard/flashcards" className="transition-colors hover:text-content">
                  ← Flashcards
                </Link>
                <Link href="/dashboard/ai-questions" className="transition-colors hover:text-content">
                  Smart Practice →
                </Link>
              </div>
              <button
                className={buttonStyles({ variant: 'primary', className: 'max-sm:w-full' })}
                onClick={handleStartSession}
                disabled={!selectedDeck?.due_count}
              >
                <Play className="h-4 w-4" />
                Begin review
              </button>
            </div>
          </>
        )}

        {phase === 'reviewing' && currentCard && (
          <>
            <StatusBar>
              <span className="font-semibold text-content">
                Card {currentCardIndex + 1} of {cardsToReview.length}
              </span>
              <span>{selectedDeck?.name || 'Selected deck'}</span>
            </StatusBar>

            <div className="flex-1 p-5">
              <h2 className="sr-only">Now reviewing {selectedDeck?.name || 'selected deck'}</h2>
              <div className="rounded-lg border border-subtle bg-surface-sunken p-5" aria-labelledby="current-card-heading">
                <MonoLabel>
                  <span id="current-card-heading">{cardFace.isCloze ? 'Fill the gap' : 'Front'}</span>
                </MonoLabel>
                <MarkdownContent className="prose prose-sm mt-2 max-w-none text-content" content={cardFace.front} />

                {showBack ? (
                  <div className="mt-5 border-t border-subtle pt-4">
                    <MonoLabel>{cardFace.isCloze ? 'Answer' : 'Back'}</MonoLabel>
                    <MarkdownContent className="prose prose-sm mt-2 max-w-none text-content" content={cardFace.back} />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="border-t border-subtle p-4">
              {!showBack ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-xs text-content-subtle max-sm:hidden">Press Space to reveal</p>
                  <button
                    className={buttonStyles({ variant: 'primary', className: 'max-sm:w-full' })}
                    onClick={() => setShowBack(true)}
                    aria-label="Reveal answer"
                    aria-keyshortcuts="Space Enter"
                  >
                    Show answer
                    <kbd className="rounded border border-white/30 px-1.5 py-0.5 text-[10px] font-semibold">Space</kbd>
                  </button>
                </div>
              ) : (
                <div className="space-y-3" role="group" aria-labelledby="recall-rating-label">
                  <MonoLabel>
                    <span id="recall-rating-label">Rate your recall</span>
                  </MonoLabel>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {reviewPreviews.map(({ label, quality, color, shortcut, interval_days }) => (
                      <button
                        key={quality}
                        className={buttonStyles({
                          variant: 'plain',
                          size: 'none',
                          className: `flex-col rounded-field border border-transparent px-4 py-3 transition-all hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${color}`,
                        })}
                        onClick={() => handleGrade(quality)}
                        aria-label={`${label}: review in ${formatInterval(interval_days)}`}
                        aria-keyshortcuts={shortcut}
                      >
                        <span className="flex items-center gap-1.5 text-body font-semibold">
                          {label}
                          <kbd className="rounded border border-white/35 px-1 text-[10px] font-semibold opacity-90">{shortcut}</kbd>
                        </span>
                        <span className="block font-mono text-caption opacity-90">{formatInterval(interval_days)}</span>
                      </button>
                    ))}
                  </div>
                  <p className="font-mono text-xs text-content-subtle">Space: reveal or Good · 1–4: grade</p>
                </div>
              )}
            </div>
          </>
        )}
      </WorkspaceBody>
    </Workspace>
  );
}
