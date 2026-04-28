'use client';

import { Play } from 'lucide-react';
import { StudySession, FlashcardDeck, Flashcard } from '@/types';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase-client';
import { updateSpacedRepetition, formatInterval, previewNextReview } from '@/lib/spacedRepetition';
import { useAuth } from '@/hooks/useAuth';
import { MathContent } from '@/components/MathContent';

export default function StudySessions() {
  type Session = Pick<
    StudySession,
    | 'id'
    | 'deck_id'
    | 'started_at'
    | 'ended_at'
    | 'duration_minutes'
    | 'cards_studied'
    | 'cards_correct'
    | 'score_percentage'
    | 'difficulty_level'
    | 'ai_recommendations'
  > & { deck_name: string };

  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<import('@/types').UserStatistics | null>(null);
  const [phase, setPhase] = useState<'idle' | 'choosing' | 'reviewing'>('idle');
  const [deckList, setDeckList] = useState<FlashcardDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [cardsToReview, setCardsToReview] = useState<Flashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<Date | null>(null);
  const [cardsStudied, setCardsStudied] = useState(0);
  const [cardsCorrect, setCardsCorrect] = useState(0);
  const [results, setResults] = useState<
    { flashcard_id: string; was_correct: boolean; time_to_answer_seconds?: number; confidence_level?: number }[]
  >([]);
  const { session } = useAuth();

  const loadSessions = useCallback(async () => {
    if (!session?.user?.id) {
      return;
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('study_sessions')
        .select('*, flashcard_decks(name)')
        .eq('user_id', session.user.id)
        .order('started_at', { ascending: false });
      if (error) {
        console.error('Error loading sessions:', error.message);
      } else {
        const mapped: Session[] = (data || []).map((s) => ({
          id: s.id,
          deck_id: s.deck_id,
          deck_name: (s as { flashcard_decks: { name: string } }).flashcard_decks?.name || 'Unknown deck',
          started_at: s.started_at || '',
          ended_at: s.ended_at || '',
          duration_minutes: s.duration_minutes || 0,
          cards_studied: s.cards_studied || 0,
          cards_correct: s.cards_correct || 0,
          score_percentage: s.score_percentage || 0,
          difficulty_level: s.difficulty_level || '',
          ai_recommendations: s.ai_recommendations || '',
        }));
        setSessions(mapped);
      }
    } catch (err) {
      console.error('Unexpected error loading sessions', err);
    }
  }, [session]);

  const loadStats = useCallback(async () => {
    if (!session?.user?.id) {
      return;
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('user_statistics')
        .select('*')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('Error loading stats:', error.message);
      } else if (data) {
        setStats(data);
      } else {
        console.warn('No study stats row found.');
      }
    } catch (err) {
      console.error('Unexpected stat fetch error', err);
    }
  }, [session]);

  const loadDecks = useCallback(async () => {
    if (!session?.user?.id) {
      return;
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('flashcard_decks')
        .select('*')
        .eq('user_id', session.user.id);
      if (error) console.error('error loading decks', error.message);
      else setDeckList(data || []);
    } catch (err) {
      console.error('unexpected deck fetch error', err);
    }
  }, [session]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadSessions();
      loadStats();
      loadDecks();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSessions, loadStats, loadDecks]);

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
    setSessionStartedAt(new Date());
    const supabase = createClient();
    const { data: cards, error } = await supabase
      .from('flashcards')
      .select('*')
      .eq('deck_id', selectedDeckId)
      .order('next_review_date', { ascending: true });
    if (error) {
      console.error('error fetching cards', error.message);
      return;
    }
    const due = (cards || []).filter((c) => {
      if (!c.next_review_date) return true;
      const nextDate = new Date(c.next_review_date);
      if (Number.isNaN(nextDate.getTime())) return true;
      return nextDate <= new Date();
    });
    if (due.length === 0) {
      alert('No cards are due for review in this deck.');
      setPhase('idle');
      return;
    }
    setCardsToReview(due);
    setCurrentCardIndex(0);
    setShowBack(false);
    setCardsStudied(0);
    setCardsCorrect(0);
    setResults([]);
    setPhase('reviewing');
  };

  const finishSession = async () => {
    if (!session?.user?.id) {
      console.error('Unable to save session: user is not authenticated.');
      return;
    }

    const endedAt = new Date();
    const duration =
      ((endedAt.getTime() - (sessionStartedAt?.getTime() || endedAt.getTime())) / 60000) || 0;
    const durationMinutes = Math.round(duration);
    const score = cardsStudied > 0 ? Math.round((cardsCorrect / cardsStudied) * 100) : 0;

    const supabase = createClient();
    const { data: insertedSession, error: sessErr } = await supabase
      .from('study_sessions')
      .insert([
        {
          user_id: session.user.id,
          deck_id: selectedDeckId,
          started_at: sessionStartedAt?.toISOString(),
          ended_at: endedAt.toISOString(),
          duration_minutes: durationMinutes,
          cards_studied: cardsStudied,
          cards_correct: cardsCorrect,
          score_percentage: score,
        },
      ])
      .select()
      .single();
    if (sessErr) console.error('session insert error', sessErr.message);
    if (results.length > 0 && insertedSession?.id) {
      const formatted = results.map((r) => ({ ...r, session_id: insertedSession.id }));
      await supabase.from('study_session_results').insert(formatted);
    }

    const { data: statsRow } = await supabase
      .from('user_statistics')
      .select('*')
      .eq('user_id', session.user.id)
      .limit(1)
      .maybeSingle();
    if (statsRow) {
      const updatedStats: Partial<import('@/types').UserStatistics> = {
        total_study_minutes: (statsRow.total_study_minutes || 0) + durationMinutes,
        total_sessions: (statsRow.total_sessions || 0) + 1,
        total_cards_studied: (statsRow.total_cards_studied || 0) + cardsStudied,
        average_score:
          statsRow.average_score && statsRow.total_sessions
            ? Math.round((statsRow.average_score * statsRow.total_sessions + score) / (statsRow.total_sessions + 1))
            : score,
        last_study_date: endedAt.toISOString().split('T')[0],
      };
      await supabase.from('user_statistics').update(updatedStats).match({ id: statsRow.id, user_id: session.user.id });
    } else {
      await supabase.from('user_statistics').insert({
        user_id: session.user.id,
        total_study_minutes: durationMinutes,
        total_sessions: 1,
        total_cards_studied: cardsStudied,
        average_score: score,
        last_study_date: endedAt.toISOString().split('T')[0],
      });
    }

    loadSessions();
    loadStats();
    setPhase('idle');
    setSelectedDeckId('');
  };

  const handleGrade = async (quality: number) => {
    const card = cardsToReview[currentCardIndex];
    if (card) {
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

      // Update the card in the cardsToReview array with the new values
      setCardsToReview(prevCards =>
        prevCards.map((c, index) =>
          index === currentCardIndex
            ? { ...c, ...updated }
            : c
        )
      );
    }
    setResults((p) => [...p, { flashcard_id: card.id, was_correct: quality >= 2 }]);
    setCardsStudied((c) => c + 1);
    if (quality >= 2) setCardsCorrect((c) => c + 1);
    const nextIndex = currentCardIndex + 1;
    if (nextIndex < cardsToReview.length) {
      setCurrentCardIndex(nextIndex);
      setShowBack(false);
    } else {
      await finishSession();
    }
  };

  return (
    <main className="space-y-8" aria-labelledby="study-sessions-title">
      <div>
        <h1 id="study-sessions-title" className="text-3xl font-bold text-gray-900 dark:text-gray-100">Study Sessions</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Start a new study session</p>
      </div>

      <section aria-labelledby="study-overview-heading" className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 id="study-overview-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Study overview</h2>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{stats?.total_sessions ?? 0}</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">sessions completed</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Average score</p>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{stats?.average_score ?? 0}%</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">across sessions</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pending history</p>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{sessions.length}</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">recent study records</p>
        </div>
      </section>

      {phase === 'idle' && (
        <div className="rounded-lg bg-linear-to-br from-blue-600 to-blue-800 p-8 text-white shadow-lg dark:from-blue-800 dark:to-blue-950">
          <h2 className="mb-4 text-2xl font-bold">Ready to study?</h2>
          <p className="mb-6 opacity-90">Choose a subject and start a focused study session</p>
          <button
            className="flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-blue-600 transition hover:bg-gray-100 dark:bg-gray-700 dark:text-blue-300 dark:hover:bg-gray-600"
            onClick={() => setPhase('choosing')}
          >
            <Play className="h-5 w-5" />
            Start New Session
          </button>
        </div>
      )}

      {phase === 'choosing' && (
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">Select a deck</h2>
          <label htmlFor="deck-select" className="sr-only">
            Choose the deck to review
          </label>
          <select
            id="deck-select"
            aria-label="Choose the deck to review"
            className="mb-4 w-full rounded border border-gray-300 p-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            value={selectedDeckId}
            onChange={(e) => setSelectedDeckId(e.target.value)}
          >
            <option value="">-- pick a deck --</option>
            {deckList.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.card_count} cards)
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              className="rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50"
              onClick={handleStartSession}
              disabled={!selectedDeckId}
            >
              Begin
            </button>
            <button
              className="rounded bg-gray-300 px-4 py-2 text-gray-800 transition hover:bg-gray-400 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500"
              onClick={() => setPhase('idle')}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === 'reviewing' && currentCard && (
        <div className="space-y-6 rounded-lg bg-white p-8 shadow dark:bg-gray-800">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Study: {deckList.find((d) => d.id === selectedDeckId)?.name}
          </h2>
          <p className="text-gray-700 dark:text-gray-300">Card {currentCardIndex + 1} of {cardsToReview.length}</p>
          <div className="rounded border border-gray-200 p-6 dark:border-gray-700" aria-labelledby="current-card-heading">
            <p id="current-card-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100">Q:</p>
            <MathContent
              className="prose prose-sm mt-2 max-w-none text-gray-900 dark:text-gray-100"
              content={currentCard.front}
              isHtml
            />
            {showBack ? (
              <>
                <p className="mt-4 font-semibold text-gray-700 dark:text-gray-300">A:</p>
                <MathContent
                  className="prose prose-sm mt-2 max-w-none text-gray-700 dark:text-gray-300"
                  content={currentCard.back}
                  isHtml
                />
                {reviewPreviews.length > 0 ? (
                  <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Next interval previews are shown for each recall rating.</p>
                ) : null}
              </>
            ) : (
              <button
                className="mt-4 rounded bg-yellow-300 px-4 py-2 text-gray-900 transition hover:bg-yellow-400 dark:bg-yellow-500 dark:text-slate-900 dark:hover:bg-yellow-400"
                onClick={() => setShowBack(true)}
                aria-label="Reveal answer"
              >
                Show Answer
              </button>
            )}
          </div>
          {showBack && (
            <div className="space-y-4" role="group" aria-labelledby="recall-rating-label">
              <p id="recall-rating-label" className="text-sm text-gray-600 dark:text-gray-400">Rate your recall:</p>
              <div className="grid grid-cols-2 gap-3">
                {reviewPreviews.map(({ label, quality, color, interval_days }) => (
                  <button
                    key={quality}
                    className={`rounded px-4 py-3 text-white transition ${color}`}
                    onClick={() => handleGrade(quality)}
                    aria-label={`${label}: review in ${formatInterval(interval_days)}`}
                  >
                    <div className="text-sm font-semibold">{label}</div>
                    <div className="text-xs opacity-90">{formatInterval(interval_days)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
