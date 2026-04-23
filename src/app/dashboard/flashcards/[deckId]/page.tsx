'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Tag, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { Flashcard, FlashcardDeck, FlashcardTag } from '@/types';
import { RichTextEditor } from '@/components/RichTextEditor';

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
  const [activeFilterTagId, setActiveFilterTagId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState('');

  const loadDeck = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const [{ data: deckData }, { data: cardsData }, { data: tagsData }] = await Promise.all([
      supabase.from('flashcard_decks').select('*').eq('id', deckId).single(),
      supabase.from('flashcards').select('*').eq('deck_id', deckId).order('created_at', { ascending: false }),
      supabase.from('flashcard_tags').select('*').eq('deck_id', deckId).order('name', { ascending: true }),
    ]);

    setDeck(deckData || null);
    setCards(cardsData || []);
    setTags(tagsData || []);

    if (cardsData && cardsData.length > 0) {
      const { data: mappings } = await supabase
        .from('flashcard_tag_mapping')
        .select('flashcard_id, tag_id')
        .in('flashcard_id', cardsData.map((card) => card.id));

      const mapped: Record<string, string[]> = {};
      (mappings || []).forEach((mapping) => {
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
      return inSearch && inTag;
    });
  }, [cards, searchQuery, activeFilterTagId, cardTags]);

  const dueCards = useMemo(() => cards.filter((card) => new Date(card.next_review_date || 0) <= new Date()).length, [cards]);

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

  if (loading) return <p className="text-slate-600 dark:text-slate-300">Loading deck...</p>;
  if (!deck) return <p className="text-red-600">Deck not found.</p>;

  return (
    <div className="space-y-7">
      <section className="rounded-2xl border border-slate-200 bg-linear-to-br from-white to-slate-100 p-6 shadow-[0_20px_40px_-36px_rgba(15,23,42,0.8)] dark:border-slate-700 dark:from-slate-900 dark:to-slate-800 dark:shadow-[0_24px_48px_-30px_rgba(2,6,23,0.95)]">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{deck.name}</h1>
        {deck.description ? <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{deck.description}</p> : null}
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full bg-white px-3 py-1 text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">{deck.card_count || cards.length} cards</span>
          <span className="rounded-full bg-white px-3 py-1 text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">{dueCards} due now</span>
          <span className="rounded-full bg-white px-3 py-1 text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">{tags.length} tags</span>
          {deck.ai_generated ? <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700 dark:bg-blue-900/45 dark:text-blue-200">AI deck</span> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Tags</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              !activeFilterTagId
                ? 'bg-slate-900 text-white dark:bg-blue-600'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
            }`}
            onClick={() => setActiveFilterTagId('')}
          >
            All cards
          </button>
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => setActiveFilterTagId((prev) => (prev === tag.id ? '' : tag.id))}
              className="rounded-full px-3 py-1 text-xs font-semibold text-white transition hover:opacity-85"
              style={{
                backgroundColor: tag.color || '#2563eb',
                boxShadow: activeFilterTagId === tag.id ? '0 0 0 2px rgba(15,23,42,0.4)' : undefined,
              }}
            >
              {tag.name}
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            placeholder="Create a new tag"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
          <button onClick={handleAddTag} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500">
            <Tag className="h-4 w-4" />
            Add tag
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Add Card (Anki-style editor)</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Use formatting shortcuts, cloze syntax, and preview before saving.</p>

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
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Attach tags</p>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const selected = selectedTags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      setSelectedTags((prev) => (selected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]))
                    }
                    className="rounded-full border px-3 py-1 text-xs font-semibold transition"
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

          <button onClick={handleAddCard} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            Add card
          </button>
          {status ? <p className="text-sm text-slate-600 dark:text-slate-300">{status}</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Cards ({filteredCards.length})</h2>
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search card text..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>

        {filteredCards.length > 0 ? (
          <div className="mt-5 grid gap-3">
            {filteredCards.map((card) => (
              <article key={card.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Front</p>
                    <div className="prose prose-sm mt-1 max-w-none text-slate-900 dark:text-slate-100" dangerouslySetInnerHTML={{ __html: card.front }} />
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Back</p>
                    <div className="prose prose-sm mt-1 max-w-none text-slate-800 dark:text-slate-200" dangerouslySetInnerHTML={{ __html: card.back }} />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteCard(card.id)}
                    className="rounded-md p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                    title="Delete card"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {cardTags[card.id] && cardTags[card.id].length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {cardTags[card.id].map((tagId) => {
                      const tag = tags.find((item) => item.id === tagId);
                      if (!tag) return null;
                      return (
                        <span key={tag.id} className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: tag.color || '#2563eb' }}>
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
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">No cards match this filter.</p>
        )}
      </section>
    </div>
  );
}
