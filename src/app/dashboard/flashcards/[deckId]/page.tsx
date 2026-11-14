'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Brain, Edit, Layers, Plus, Radar, Search, Tag, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { Flashcard, FlashcardDeck, FlashcardTag, FlashcardTagMapping } from '@/types';
import { RichTextEditor } from '@/components/RichTextEditor';
import { MarkdownContent } from '@/components/MarkdownContent';
import { buttonStyles } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/feedback';
import { fieldStyles } from '@/components/ui/field';
import { Chip, MonoLabel, Panel, PanelHeading, Stat, StatusBar, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { countLeeches, isLeech } from '@/lib/leeches';
import { countDueCards } from '@/lib/flashcardsDue';

const TAG_COLORS = ['#2563eb', '#0f766e', '#7c3aed', '#be123c', '#b45309', '#0284c7'];

export default function DeckPage() {
  const params = useParams();
  const deckId = params?.deckId as string;
  const [deck, setDeck] = useState<FlashcardDeck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [tags, setTags] = useState<FlashcardTag[]>([]);
  const [cardTags, setCardTags] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [newTag, setNewTag] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAddCard, setShowAddCard] = useState(false);
  const [activeFilterTagId, setActiveFilterTagId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLeechesOnly, setShowLeechesOnly] = useState(false);
  const [status, setStatus] = useState('');
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [editSelectedTags, setEditSelectedTags] = useState<string[]>([]);

  const loadDeck = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const [{ data: deckData }, { data: cardsData }, { data: tagsData }] = await Promise.all([
      supabase.from('flashcard_decks').select('*').eq('id', deckId).single(),
      supabase.from('flashcards').select('*').eq('deck_id', deckId).order('created_at', { ascending: false }),
      supabase.from('flashcard_tags').select('*').eq('deck_id', deckId).order('name', { ascending: true }),
    ]);

    const deckRow = (deckData || null) as FlashcardDeck | null;
    const cardRows = (cardsData || []) as Flashcard[];
    const tagRows = (tagsData || []) as FlashcardTag[];

    setDeck(deckRow);
    setCards(cardRows);
    setTags(tagRows);

    if (cardRows.length > 0) {
      const { data: mappings } = await supabase
        .from('flashcard_tag_mapping')
        .select('flashcard_id, tag_id')
        .in('flashcard_id', cardRows.map((card) => card.id));

      const mapped: Record<string, string[]> = {};
      ((mappings || []) as Pick<FlashcardTagMapping, 'flashcard_id' | 'tag_id'>[]).forEach((mapping) => {
        if (!mapped[mapping.flashcard_id]) mapped[mapping.flashcard_id] = [];
        mapped[mapping.flashcard_id].push(mapping.tag_id);
      });
      setCardTags(mapped);
    } else {
      setCardTags({});
    }

    setLoading(false);
  }, [deckId]);

  useEffect(() => {
    if (deckId) {
      const timer = window.setTimeout(() => {
        void loadDeck();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [deckId, loadDeck]);

  const filteredCards = useMemo(() => {
    const lowered = searchQuery.trim().toLowerCase();
    return cards.filter((card) => {
      const inSearch = !lowered || card.front.toLowerCase().includes(lowered) || card.back.toLowerCase().includes(lowered);
      const inTag = !activeFilterTagId || (cardTags[card.id] || []).includes(activeFilterTagId);
      const inLeech = !showLeechesOnly || isLeech(card);
      return inSearch && inTag && inLeech;
    });
  }, [cards, searchQuery, activeFilterTagId, cardTags, showLeechesOnly]);

  const dueCards = useMemo(() => countDueCards(cards, new Date()), [cards]);
  const leechCount = useMemo(() => countLeeches(cards), [cards]);

  const handleAddCard = async () => {
    if (!newFront.trim() || !newBack.trim()) {
      setStatus('Both front and back are required.');
      return;
    }

    const supabase = createClient();
    const { data: card, error } = await supabase
      .from('flashcards')
      .insert([{ deck_id: deckId, front: newFront.trim(), back: newBack.trim() }])
      .select()
      .single();

    if (error || !card) {
      setStatus(error?.message || 'Unable to create card.');
      return;
    }

    if (selectedTags.length > 0) {
      await supabase.from('flashcard_tag_mapping').insert(
        selectedTags.map((tagId) => ({
          flashcard_id: card.id,
          tag_id: tagId,
        }))
      );
      setCardTags((prev) => ({
        ...prev,
        [card.id]: [...selectedTags],
      }));
    }

    setCards((prev) => [card as Flashcard, ...prev]);
    setNewFront('');
    setNewBack('');
    setSelectedTags([]);
    setStatus('Card added.');
    setShowAddCard(false);
    const nextCount = (deck?.card_count || 0) + 1;
    setDeck((prev) => (prev ? { ...prev, card_count: nextCount } : prev));
    await supabase.from('flashcard_decks').update({ card_count: nextCount }).eq('id', deckId);
  };

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from('flashcard_tags')
      .insert([
        {
          deck_id: deckId,
          name: newTag.trim(),
          color: TAG_COLORS[tags.length % TAG_COLORS.length],
        },
      ])
      .select()
      .single();

    if (error || !data) {
      setStatus(error?.message || 'Unable to create tag.');
      return;
    }

    setTags((prev) => [...prev, data as FlashcardTag]);
    setNewTag('');
  };

  const handleDeleteCard = async (cardId: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('flashcards').delete().eq('id', cardId);
    if (error) {
      setStatus(error.message);
      return;
    }

    const nextCards = cards.filter((card) => card.id !== cardId);
    setCards(nextCards);
    setCardTags((prev) => {
      const updated = { ...prev };
      delete updated[cardId];
      return updated;
    });
    const nextCount = Math.max((deck?.card_count || 1) - 1, 0);
    setDeck((prev) => (prev ? { ...prev, card_count: nextCount } : prev));
    await supabase.from('flashcard_decks').update({ card_count: nextCount }).eq('id', deckId);
  };

  const handleEditCard = (card: Flashcard) => {
    setEditingCard(card);
    setEditFront(card.front);
    setEditBack(card.back);
    setEditSelectedTags(cardTags[card.id] || []);
  };

  const handleSaveEdit = async () => {
    if (!editingCard || !editFront.trim() || !editBack.trim()) {
      setStatus('Both front and back are required.');
      return;
    }

    const supabase = createClient();
    
    // Update the card content
    const { error: cardError } = await supabase
      .from('flashcards')
      .update({ 
        front: editFront.trim(), 
        back: editBack.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', editingCard.id);

    if (cardError) {
      setStatus(cardError.message);
      return;
    }

    // Update tags - remove old mappings and add new ones
    await supabase.from('flashcard_tag_mapping').delete().eq('flashcard_id', editingCard.id);
    
    if (editSelectedTags.length > 0) {
      await supabase.from('flashcard_tag_mapping').insert(
        editSelectedTags.map((tagId) => ({
          flashcard_id: editingCard.id,
          tag_id: tagId,
        }))
      );
    }

    // Update local state
    setCards((prev) => prev.map((card) => 
      card.id === editingCard.id 
        ? { ...card, front: editFront.trim(), back: editBack.trim(), updated_at: new Date().toISOString() }
        : card
    ));
    setCardTags((prev) => ({
      ...prev,
      [editingCard.id]: [...editSelectedTags],
    }));

    setEditingCard(null);
    setEditFront('');
    setEditBack('');
    setEditSelectedTags([]);
    setStatus('Card updated.');
  };

  const handleCancelEdit = () => {
    setEditingCard(null);
    setEditFront('');
    setEditBack('');
    setEditSelectedTags([]);
  };

  if (loading) return <p className="text-content-muted">Loading deck...</p>;
  if (!deck) return <p className="text-danger">Deck not found.</p>;

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Deck report</PanelHeading>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Cards" value={deck.card_count || cards.length} />
        <Stat label="Due now" value={dueCards} tone={dueCards > 0 ? 'warning' : 'default'} />
        <Stat label="Tags" value={tags.length} />
        <Stat label="Leeches" value={leechCount} tone={leechCount > 0 ? 'danger' : 'default'} />
      </div>

      <Panel>
        <PanelHeading icon={Tag} as="h3">
          Tags
        </PanelHeading>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={buttonStyles({
              variant: 'plain',
              size: 'chip',
              className: !activeFilterTagId ? 'bg-accent text-accent-fg' : 'bg-surface-sunken text-content-muted',
            })}
            onClick={() => setActiveFilterTagId('')}
            aria-label="Show all cards"
          >
            All cards
          </button>
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => setActiveFilterTagId((prev) => (prev === tag.id ? '' : tag.id))}
              className={buttonStyles({
                variant: 'plain',
                size: 'chip',
                className: 'text-white hover:opacity-85',
              })}
              aria-label={`Filter cards by tag ${tag.name}`}
              style={{
                backgroundColor: tag.color || '#2563eb',
                boxShadow: activeFilterTagId === tag.id ? '0 0 0 2px rgba(15,23,42,0.4)' : undefined,
              }}
            >
              {tag.name}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            placeholder="Create a new tag"
            aria-label="New tag name"
            className={fieldStyles('min-w-0 flex-1')}
          />
          <button onClick={handleAddTag} className={buttonStyles({ variant: 'secondary', size: 'icon' })} aria-label="Add tag">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </Panel>

      <Panel>
        <p className="text-sm font-semibold text-content">Revise this deck</p>
        <p className="mt-1 text-[13px] text-content-subtle">
          {dueCards > 0 ? `${dueCards} card${dueCards === 1 ? ' is' : 's are'} due now.` : 'Nothing due right now.'}
        </p>
        <Link
          href={`/dashboard/study-sessions?deckId=${deckId}`}
          className={buttonStyles({ variant: 'primary', size: 'sm', className: 'mt-3 w-full justify-center' })}
        >
          <Brain className="h-4 w-4" />
          Flashcard Revision
        </Link>
      </Panel>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={Layers}
        eyebrow="Flashcards / Deck"
        titleId="deck-page-title"
        title={deck.name}
        description={deck.description || undefined}
        backHref="/dashboard/flashcards"
        backLabel="Flashcards"
        actions={
          <>
            <Chip>● {deck.card_count || cards.length} cards</Chip>
            <Chip tone={dueCards > 0 ? 'warning' : 'neutral'}>{dueCards} due now</Chip>
            {deck.ai_generated ? <Chip tone="xp">AI deck</Chip> : null}
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        <div className="flex flex-wrap items-center gap-2 border-b border-subtle p-5">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-content-subtle" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search card text..."
              aria-label="Search cards"
              className={fieldStyles('pl-9')}
            />
          </div>
          {leechCount > 0 && (
            <button
              type="button"
              onClick={() => setShowLeechesOnly((v) => !v)}
              aria-pressed={showLeechesOnly}
              className={buttonStyles({
                variant: showLeechesOnly ? 'danger' : 'secondary',
              })}
              title="Cards you repeatedly get wrong — fix these first"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {showLeechesOnly ? 'Showing leeches' : `${leechCount} leech${leechCount === 1 ? '' : 'es'}`}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setStatus('');
              setShowAddCard(true);
            }}
            className={buttonStyles({ variant: 'primary' })}
          >
            <Plus className="h-4 w-4" />
            Add card
          </button>
        </div>

        <StatusBar>
          <h2 className="font-semibold text-content">Cards ({filteredCards.length})</h2>
          {activeFilterTagId ? <span>Filtered by tag</span> : null}
          {status ? (
            <span role="status" aria-live="polite" className="text-content-muted">
              {status}
            </span>
          ) : null}
        </StatusBar>

        <div className="flex-1 p-5">
          {filteredCards.length > 0 ? (
            <div className="grid gap-3">
              {filteredCards.map((card) => (
                <article key={card.id} className="rounded-lg border border-subtle bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <MonoLabel className="flex items-center gap-2">
                        Front
                        {isLeech(card) && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-danger-muted px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-danger">
                            <AlertTriangle className="h-3 w-3" /> Leech
                          </span>
                        )}
                      </MonoLabel>
                      <MarkdownContent className="prose prose-sm mt-1 max-w-none text-content" content={card.front} />
                      <MonoLabel className="mt-3">Back</MonoLabel>
                      <MarkdownContent className="prose prose-sm mt-1 max-w-none text-content-muted" content={card.back} />
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleEditCard(card)}
                        className={buttonStyles({ variant: 'ghost', size: 'icon' })}
                        title="Edit card"
                        aria-label="Edit card"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCard(card.id)}
                        className={buttonStyles({ variant: 'danger-ghost', size: 'icon' })}
                        title="Delete card"
                        aria-label="Delete card"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {cardTags[card.id] && cardTags[card.id].length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {cardTags[card.id].map((tagId) => {
                        const tag = tags.find((item) => item.id === tagId);
                        if (!tag) return null;
                        return (
                          <span
                            key={tag.id}
                            className="rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold text-white"
                            style={{ backgroundColor: tag.color || '#2563eb' }}
                          >
                            {tag.name}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-content-muted">No cards match this filter.</p>
          )}
        </div>
      </WorkspaceBody>

      {showAddCard ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <style>{`
            @keyframes deck-modal-backdrop-in {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes deck-modal-panel-in {
              from { opacity: 0; transform: scale(0.94) translateY(10px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAddCard(false)}
            style={{ animation: 'deck-modal-backdrop-in 160ms ease-out both' }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-card-heading"
            className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-card border border-subtle bg-surface p-6 shadow-overlay"
            style={{ animation: 'deck-modal-panel-in 190ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <MonoLabel>{deck.name} / New card</MonoLabel>
                <h2 id="add-card-heading" className="mt-1 text-title text-content">Add card</h2>
                <p className="mt-1 text-sm text-content-muted">Use formatting shortcuts, cloze syntax, and preview before saving.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCard(false)}
                className={buttonStyles({ variant: 'ghost', size: 'icon' })}
                aria-label="Close add card dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <RichTextEditor
                value={newFront}
                onChange={setNewFront}
                label="Front"
                placeholder="Question, prompt, or cue..."
                minHeightClassName="min-h-[140px]"
              />
              <RichTextEditor
                value={newBack}
                onChange={setNewBack}
                label="Back"
                placeholder="Answer, explanation, or mnemonic..."
                minHeightClassName="min-h-[180px]"
              />

              <div>
                <MonoLabel className="mb-2">Attach tags</MonoLabel>
                <div className="flex flex-wrap gap-2">
                  {tags.length > 0 ? tags.map((tag) => {
                    const selected = selectedTags.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() =>
                          setSelectedTags((prev) => (selected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]))
                        }
                        className={buttonStyles({
                          variant: 'plain',
                          size: 'chip',
                          className: 'border',
                        })}
                        style={{
                          borderColor: tag.color || '#2563eb',
                          color: selected ? '#ffffff' : tag.color || '#2563eb',
                          backgroundColor: selected ? tag.color || '#2563eb' : 'transparent',
                        }}
                      >
                        {selected ? <X className="mr-1 inline h-3 w-3" /> : <Plus className="mr-1 inline h-3 w-3" />}
                        {tag.name}
                      </button>
                    );
                  }) : (
                    <p className="text-sm text-content-subtle">No tags yet.</p>
                  )}
                </div>
              </div>

              {status ? (
                <p role="status" aria-live="polite" className="text-sm text-content-muted">
                  {status}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCard(false)}
                  className={buttonStyles({ variant: 'secondary' })}
                >
                  Cancel
                </button>
                <button type="button" onClick={handleAddCard} className={buttonStyles({ variant: 'primary' })}>
                  <Plus className="h-4 w-4" />
                  Add card
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editingCard ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancelEdit} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-card-heading"
            className="relative z-10 w-full max-w-2xl rounded-card border border-subtle bg-surface p-6 shadow-overlay"
          >
            <MonoLabel>{deck.name} / Edit card</MonoLabel>
            <h2 id="edit-card-heading" className="mt-1 text-title text-content">Edit card</h2>
            <p className="mt-1 text-sm text-content-muted">Update the card content and tags.</p>

            <div className="mt-4 space-y-4">
              <RichTextEditor
                value={editFront}
                onChange={setEditFront}
                label="Front"
                placeholder="Question, prompt, or cue..."
                minHeightClassName="min-h-[140px]"
              />
              <RichTextEditor
                value={editBack}
                onChange={setEditBack}
                label="Back"
                placeholder="Answer, explanation, or mnemonic..."
                minHeightClassName="min-h-[180px]"
              />

              <div>
                <MonoLabel className="mb-2">Attach tags</MonoLabel>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => {
                    const selected = editSelectedTags.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() =>
                          setEditSelectedTags((prev) => (selected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]))
                        }
                        className={buttonStyles({
                          variant: 'plain',
                          size: 'chip',
                          className: 'border',
                        })}
                        style={{
                          borderColor: tag.color || '#2563eb',
                          color: selected ? '#ffffff' : tag.color || '#2563eb',
                          backgroundColor: selected ? tag.color || '#2563eb' : 'transparent',
                        }}
                      >
                        {selected ? <X className="mr-1 inline h-3 w-3" /> : <Plus className="mr-1 inline h-3 w-3" />}
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  className={buttonStyles({ variant: 'secondary' })}
                  onClick={handleCancelEdit}
                >
                  Cancel
                </button>
                <button 
                  className={buttonStyles({ variant: 'primary' })}
                  onClick={handleSaveEdit}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Workspace>
  );
}
