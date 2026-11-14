'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bot, Plus, Radar, Sparkles, Trash2, Brain, Layers } from 'lucide-react';
import { Flashcard, FlashcardDeck } from '@/types';
import { createClient } from '@/lib/supabase-client';
import { Button, buttonStyles } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/feedback';
import { Alert, fieldStyles } from '@/components/ui/field';
import { Chip, MonoLabel, Panel, PanelHeading, Stat, StatusBar, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { isCardDue } from '@/lib/flashcardsDue';

type Deck = Pick<FlashcardDeck, 'id' | 'name' | 'card_count' | 'ai_generated' | 'updated_at' | 'created_at' | 'description'> & {
  due_count?: number;
};
type DeckCardReviewRow = Pick<Flashcard, 'deck_id' | 'next_review_date'>;

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
            const cardRows = cardData as DeckCardReviewRow[];
            const now = new Date();
            const dueCounts = new Map<string, number>();

            cardRows.forEach((card) => {
              if (isCardDue(card.next_review_date, now)) {
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

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Deck report</PanelHeading>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Decks" value={stats.totalDecks} />
        <Stat label="Cards" value={stats.totalCards} />
        <Stat label="Due now" value={stats.dueNow} tone={stats.dueNow > 0 ? 'warning' : 'default'} />
        <Stat label="AI decks" value={stats.aiDecks} />
      </div>
      <Panel className="space-y-2">
        <p className="text-sm font-semibold text-content">Make a deck</p>
        <Button variant="secondary" onClick={() => setShowCreate(true)} className="w-full justify-center">
          <Plus className="h-4 w-4" />
          New deck
        </Button>
        <Link href="/dashboard/flashcards/ai" className={buttonStyles({ variant: 'secondary', className: 'w-full justify-center' })}>
          <Sparkles className="h-4 w-4 text-accent" />
          Generate with AI
        </Link>
      </Panel>
      <Panel>
        <p className="text-sm font-semibold text-content">Ready to revise?</p>
        <p className="mt-1 text-[13px] text-content-subtle">
          {stats.dueNow > 0
            ? `${stats.dueNow} card${stats.dueNow === 1 ? ' is' : 's are'} due. Due cards come first.`
            : 'Nothing is due right now. Cards come back as they are due.'}
        </p>
        <Link
          href="/dashboard/study-sessions"
          className={buttonStyles({ variant: 'primary', size: 'sm', className: 'mt-3 w-full justify-center' })}
        >
          <Brain className="h-4 w-4" />
          Flashcard Revision
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Panel>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={Layers}
        eyebrow="Learn / Flashcards"
        titleId="flashcards-title"
        title="Flashcards"
        description="Build flashcards from what you learned."
        actions={
          <>
            <Chip>● {stats.totalDecks} decks</Chip>
            <Chip tone={stats.dueNow > 0 ? 'warning' : 'neutral'}>
              <Layers className="h-3 w-3" /> {stats.dueNow} due now
            </Chip>
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        <div className="flex flex-wrap items-center gap-3 border-b border-subtle p-5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search deck names or descriptions..."
            aria-label="Search deck names or descriptions"
            className={fieldStyles('min-w-55 flex-1')}
          />
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as 'recent' | 'name' | 'cards')}
            aria-label="Sort decks"
            className={fieldStyles('sm:w-auto')}
          >
            <option value="recent">Sort: Recently updated</option>
            <option value="name">Sort: Name</option>
            <option value="cards">Sort: Card count</option>
          </select>
        </div>

        {status ? (
          <div className="border-b border-subtle p-4">
            <Alert tone={status.tone === 'error' ? 'danger' : 'success'}>{status.text}</Alert>
          </div>
        ) : null}

        <StatusBar>
          <span>
            Showing <span className="font-semibold text-content">{filteredDecks.length}</span> of {stats.totalDecks} decks
          </span>
        </StatusBar>

        <section className="grid flex-1 grid-cols-1 content-start gap-3 p-5 xl:grid-cols-2" aria-label="Decks">
          {isLoading ? <p className="text-sm text-content-muted">Loading decks...</p> : null}
          {!isLoading && filteredDecks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-subtle bg-surface-sunken p-8 text-center text-sm text-content-muted xl:col-span-2">
              No decks match your filters.
            </div>
          ) : null}
          {filteredDecks.map((deck) => (
            <article key={deck.id} className="flex flex-col rounded-lg border border-subtle bg-surface p-4 transition-colors hover:border-strong">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-content">{deck.name}</h3>
                  {deck.description ? <p className="mt-1 text-sm text-content-muted">{deck.description}</p> : null}
                </div>
                <button
                  onClick={() => handleDeleteDeck(deck.id)}
                  className={buttonStyles({ variant: 'danger-ghost', size: 'icon' })}
                  title="Delete deck"
                  aria-label={`Delete deck "${deck.name}"`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Chip>{deck.card_count || 0} cards</Chip>
                {deck.due_count ? <Chip tone="warning">{deck.due_count} due now</Chip> : null}
                {deck.ai_generated ? (
                  <Chip tone="xp">
                    <Bot className="h-3 w-3" />
                    AI generated
                  </Chip>
                ) : null}
              </div>

              <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                <p className="font-mono text-[11px] text-content-subtle">
                  Updated {new Date(deck.updated_at || deck.created_at || '').toLocaleDateString()}
                </p>
                <Link href={`/dashboard/flashcards/${deck.id}`} className={buttonStyles({ variant: 'primary', size: 'sm' })}>
                  Open deck
                </Link>
              </div>
            </article>
          ))}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle p-4 font-mono text-xs text-content-subtle">
          <Link href="/dashboard/notes" className="transition-colors hover:text-content">
            ← Learn
          </Link>
          <Link href="/dashboard/study-sessions" className="transition-colors hover:text-content">
            Flashcard Revision →
          </Link>
        </div>
      </WorkspaceBody>

      {showCreate ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-deck-title"
            className="relative z-10 w-full max-w-md rounded-card border border-subtle bg-surface p-6 shadow-overlay"
          >
            <MonoLabel>Flashcards / New deck</MonoLabel>
            <h2 id="create-deck-title" className="mt-1 text-title text-content">Create deck</h2>
            <p className="mt-1 text-sm text-content-muted">Name your deck and start adding cards.</p>
            <label className="mt-4 block">
              <MonoLabel className="mb-1">Deck name</MonoLabel>
              <input
                value={newDeckName}
                onChange={(event) => setNewDeckName(event.target.value)}
                placeholder="Example: Renal Physiology Midterm"
                className={fieldStyles()}
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateDeck}>Create</Button>
            </div>
          </div>
        </div>
      ) : null}
    </Workspace>
  );
}
