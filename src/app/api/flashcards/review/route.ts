import { NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { tryCreateAdminClient } from '@/lib/supabase-admin';
import { recordMasteryEvents } from '@/lib/mastery/record';
import { outcomeFromReviewQuality } from '@/lib/mastery';
import { updateSpacedRepetition, type CardSRState } from '@/lib/spacedRepetition';

/**
 * Grade one flashcard and record it as Learning Spine evidence.
 *
 * Reviews used to be a direct client-side UPDATE on `flashcards`. They have to
 * come through the server now because `mastery_events` has no client write
 * policy -- mastery drives predicted grades and the planner, so a student able
 * to insert their own evidence could forge both.
 *
 * The security property this route exists to hold: the client sends only which
 * card and which button. The subtopic is read from the database, and the
 * outcome is derived here. Neither is accepted from the request, so the worst a
 * tampered request can do is claim a review that did happen went better than it
 * did -- exactly the leverage the old client-side UPDATE already gave.
 */

type ReviewPayload = { cardId?: unknown; quality?: unknown };

type CardRow = CardSRState & {
  id: string;
  deck_id: string;
  subtopic_id: string | null;
  flashcard_decks: { user_id: string } | null;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as ReviewPayload;
    const cardId = typeof body.cardId === 'string' ? body.cardId : '';
    const quality = typeof body.quality === 'number' ? Math.trunc(body.quality) : NaN;

    if (!cardId) return NextResponse.json({ error: 'cardId is required.' }, { status: 400 });
    if (!Number.isFinite(quality) || quality < 0 || quality > 3) {
      return NextResponse.json({ error: 'quality must be 0-3.' }, { status: 400 });
    }

    const { data: cardData, error: cardError } = await supabase
      .from('flashcards')
      .select(
        'id, deck_id, subtopic_id, ease_factor, interval_days, repetition_count, consecutive_correct, last_studied_at, next_review_date, times_studied, times_correct, flashcard_decks!inner(user_id)'
      )
      .eq('id', cardId)
      .maybeSingle();

    if (cardError || !cardData) return NextResponse.json({ error: 'Card not found.' }, { status: 404 });
    const card = cardData as unknown as CardRow;

    // Checked explicitly rather than leaning on RLS: the SELECT policy also
    // exposes public decks, so passing the read is not proof of ownership.
    if (card.flashcard_decks?.user_id !== authData.user.id) {
      return NextResponse.json({ error: 'Card not found.' }, { status: 404 });
    }

    const update = updateSpacedRepetition(card, quality);

    // Written with the caller's client so the existing owner policy still
    // governs the card itself; only the spine needs the service role.
    const { error: updateError } = await supabase.from('flashcards').update(update).eq('id', cardId);
    if (updateError) {
      return NextResponse.json({ error: 'Failed to save your review.' }, { status: 500 });
    }

    if (card.subtopic_id) {
      const spineClient = tryCreateAdminClient();
      if (spineClient) {
        const userId = authData.user.id;
        const subtopicId = card.subtopic_id;
        after(async () => {
          const result = await recordMasteryEvents(spineClient, userId, [
            {
              subtopicId,
              outcome: outcomeFromReviewQuality(quality),
              source: 'flashcard',
              sourceId: cardId,
            },
          ]);
          for (const error of result.errors) console.error(`[spine] ${error}`);
        });
      }
    }

    return NextResponse.json({ success: true, update });
  } catch {
    return NextResponse.json({ error: 'Failed to save your review.' }, { status: 500 });
  }
}
