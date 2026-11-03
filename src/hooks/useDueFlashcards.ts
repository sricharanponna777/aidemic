'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { XP_AWARDED_EVENT } from '@/lib/gamification/client';

/**
 * How many of the student's own flashcards are due, for the "N due" count on
 * the Review nav item. Counted in the database rather than by fetching every
 * card: `next_review_date` is a timestamptz, so "null or not after now" is
 * exactly isCardDue() in flashcardsDue.ts -- an unparseable date cannot exist
 * in that column. Own decks only, the same scope Daily Review queues from.
 */
const countDue = async (userId: string): Promise<number> => {
  const { count, error } = await createClient()
    .from('flashcards')
    .select('id, flashcard_decks!inner(user_id)', { count: 'exact', head: true })
    .eq('flashcard_decks.user_id', userId)
    .or(`next_review_date.is.null,next_review_date.lte.${new Date().toISOString()}`);
  if (error) throw error;
  return count ?? 0;
};

export function useDueFlashcards({ enabled }: { enabled: boolean }) {
  const { session } = useAuth();
  const userId = enabled ? session?.user?.id ?? null : null;
  const swr = useSWR(userId ? ['due-flashcards', userId] : null, () => countDue(userId as string));

  // Reviewing a card pays XP, so an award is also the moment the count drops.
  const { mutate } = swr;
  useEffect(() => {
    if (!userId) return;
    const refresh = () => void mutate();
    window.addEventListener(XP_AWARDED_EVENT, refresh);
    return () => window.removeEventListener(XP_AWARDED_EVENT, refresh);
  }, [userId, mutate]);

  return swr;
}
