'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Plus, Sparkles, Trash2 } from 'lucide-react';
import { FlashcardDeck } from '@/types';
import { createClient } from '@/lib/supabase-client';

type Deck = Pick<FlashcardDeck, 'id' | 'name' | 'card_count' | 'ai_generated' | 'updated_at' | 'created_at' | 'description'> & {
  due_count?: number;
};

type StatusTone = 'success' | 'error';
type StatusMessage = {
  tone: StatusTone;
  text: string;
};

export default function Flashcards() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'cards'>('recent');
  const [showCreate, setShowCreate] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [status, setStatus] = useState<StatusMessage | null>(null);

  const loadDecks = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('flashcard_decks')
        .select('id, name, card_count, ai_generated, updated_at, created_at, description')
        .order('updated_at', { ascending: false });

      if (error) {
        setStatus({ tone: 'error', text: error.message });
      } else {
        const fetchedDecks = (data || []) as Deck[];
        const deckIds = fetchedDecks.map((deck) => deck.id);

        if (deckIds.length > 0) {
          const { data: cardData, error: cardError } = await supabase
            .from('flashcards')
            .select('deck_id, next_review_date')
            .in('deck_id', deckIds);

          if (!cardError && cardData) {
            const now = new Date();
            const dueCounts = new Map<string, number>();

            cardData.forEach((card) => {
              const nextReview = card.next_review_date ? new Date(card.next_review_date) : null;
              const isDue = !nextReview || nextReview <= now;
              if (isDue) {
                dueCounts.set(card.deck_id, (dueCounts.get(card.deck_id) || 0) + 1);
              }
            });

            const decksWithDue = fetchedDecks.map((deck) => ({
              ...deck,
              due_count: dueCounts.get(deck.id) || 0,
            }));
            setDecks(decksWithDue);
          } else {
            setDecks(fetchedDecks);
          }
        } else {
          setDecks(fetchedDecks);
        }
      }
    } catch (err) {
      console.error('Unexpected error loading decks', err);
      setStatus({ tone: 'error', text: 'Unable to load decks right now.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDecks();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDecks]);

  const stats = useMemo(() => {
    const totalCards = decks.reduce((sum, deck) => sum + (deck.card_count || 0), 0);
    const dueNow = decks.reduce((sum, deck) => sum + (deck.due_count || 0), 0);
    const aiDecks = decks.filter((deck) => deck.ai_generated).length;
    return { totalDecks: decks.length, totalCards, dueNow, aiDecks };
  }, [decks]);

  const filteredDecks = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    const matches = decks.filter((deck) => {
      if (!lowered) return true;
      return deck.name.toLowerCase().includes(lowered) || (deck.description || '').toLowerCase().includes(lowered);
    });

    if (sortBy === 'name') return [...matches].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === 'cards') return [...matches].sort((a, b) => (b.card_count || 0) - (a.card_count || 0));
    return [...matches].sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
  }, [decks, query, sortBy]);

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) return;
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setStatus({ tone: 'error', text: 'You need to sign in again.' });
        return;
      }

      const { error } = await supabase.from('flashcard_decks').insert([
        {
          user_id: user.id,
          name: newDeckName.trim(),
          card_count: 0,
        },
      ]);

      if (error) {
        setStatus({ tone: 'error', text: error.message });
      } else {
        setShowCreate(false);
        setNewDeckName('');
        setStatus({ tone: 'success', text: 'Deck created.' });
        await loadDecks();
      }
    } catch (err) {
      console.error('Unexpected error creating deck', err);
      setStatus({ tone: 'error', text: 'Unable to create deck right now.' });
    }
  };

  const handleDeleteDeck = async (deckId: string) => {
    const confirmDelete = window.confirm('Delete this deck and all cards? This cannot be undone.');
    if (!confirmDelete) return;

    const supabase = createClient();
    const { error } = await supabase.from('flashcard_decks').delete().eq('id', deckId);
    if (error) {
      setStatus({ tone: 'error', text: error.message });
      return;
    }
    setDecks((prev) => prev.filter((deck) => deck.id !== deckId));
    setStatus({ tone: 'success', text: 'Deck deleted.' });
  };

  const statusClassName = status
    ? {
        success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-950/35 dark:text-emerald-200',
        error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-700/70 dark:bg-red-950/35 dark:text-red-200',
      }[status.tone]
    : '';

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-linear-to-br from-white to-slate-100 p-6 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.7)] dark:border-slate-700 dark:from-slate-900 dark:to-slate-800 dark:shadow-[0_24px_48px_-28px_rgba(2,6,23,0.95)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Flashcards</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">Study Deck Studio</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Build and organise decks, or create AI-generated flashcard decks.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-4 w-4" />
              New Deck
            </button>
            <Link
              href="/dashboard/flashcards/ai"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <Sparkles className="h-4 w-4" />
              AI Flashcards
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Decks</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.totalDecks}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Cards</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.totalCards}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Due now</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.dueNow}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search deck names or descriptions..."
            className="min-w-55 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as 'recent' | 'name' | 'cards')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="recent">Sort: Recently updated</option>
            <option value="name">Sort: Name</option>
            <option value="cards">Sort: Card count</option>
          </select>
        </div>
      </section>

      {status ? <div className={`rounded-xl border px-4 py-3 text-sm ${statusClassName}`}>{status.text}</div> : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {isLoading ? <p className="text-sm text-slate-600 dark:text-slate-300">Loading decks...</p> : null}
        {!isLoading && filteredDecks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            No decks match your filters.
          </div>
        ) : null}
        {filteredDecks.map((deck) => (
          <article key={deck.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_-36px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-36px_rgba(15,23,42,0.9)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_20px_50px_-30px_rgba(2,6,23,0.95)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{deck.name}</h3>
                {deck.description ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{deck.description}</p> : null}
              </div>
              <button
                onClick={() => handleDeleteDeck(deck.id)}
                className="rounded-md p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                title="Delete deck"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{deck.card_count || 0} cards</span>
              {deck.due_count ? (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{deck.due_count} due now</span>
              ) : null}
              {deck.ai_generated ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                  <Bot className="h-3 w-3" />
                  AI generated
                </span>
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400">Updated {new Date(deck.updated_at || deck.created_at || '').toLocaleDateString()}</p>
              <Link
                href={`/dashboard/flashcards/${deck.id}`}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                Open deck
              </Link>
            </div>
          </article>
        ))}
      </section>

      {showCreate ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowCreate(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Create deck</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Name your deck and start adding cards.</p>
            <input
              value={newDeckName}
              onChange={(event) => setNewDeckName(event.target.value)}
              placeholder="Example: Renal Physiology Midterm"
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={handleCreateDeck}>
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
