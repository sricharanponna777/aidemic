import type { SupabaseClient } from '@supabase/supabase-js';
import type { EarnedBadge, XpAward, XpSource } from '@/types';

/**
 * Pay XP for a completed activity, via the `award_xp()` RPC.
 *
 * That function is executable by service_role only -- XP feeds leagues and
 * class leaderboards, so a student able to call it could top both -- which is
 * why this takes the admin client and must only run in server code, AFTER the
 * caller has worked out the score itself. Never pass a score taken from the
 * request body.
 *
 * Best-effort, like the Learning Spine writes: a failure returns null and is
 * logged, and the caller's response goes out without XP rather than failing.
 * Unlike them it is awaited, not deferred with after(), because the response is
 * where the student sees what they earned -- it is one round trip.
 */

export interface AwardXpInput {
  source: XpSource;
  /** 0..1, computed server-side. */
  score: number;
  /** Marks on the set, for marked sources -- XP scales with it. */
  marksAvailable?: number | null;
  /**
   * Idempotency key: the same key is never paid twice. Use the activity's
   * natural identity ('assignment:<id>', 'paper:<id>') where it has one.
   */
  awardKey?: string | null;
}

type AwardRow = {
  xp_awarded?: number;
  base_xp?: number;
  multiplier?: number | string;
  capped?: boolean;
  duplicate?: boolean;
  total_xp?: number | string;
  current_streak?: number;
  new_badges?: EarnedBadge[];
};

export async function awardXp(
  admin: SupabaseClient | null,
  userId: string,
  input: AwardXpInput
): Promise<XpAward | null> {
  if (!admin) return null;
  try {
    const { data, error } = await admin.rpc('award_xp', {
      p_user_id: userId,
      p_source: input.source,
      p_score: Number.isFinite(input.score) ? Math.min(1, Math.max(0, input.score)) : 0,
      p_marks_available: input.marksAvailable ?? null,
      p_award_key: input.awardKey ?? null,
    });
    if (error) {
      console.error('[xp] award_xp failed', error.message);
      return null;
    }
    const row = (data ?? {}) as AwardRow;
    return {
      xpAwarded: row.xp_awarded ?? 0,
      baseXp: row.base_xp ?? 0,
      multiplier: Number(row.multiplier ?? 1),
      capped: Boolean(row.capped),
      duplicate: Boolean(row.duplicate),
      // bigint can arrive as a string over the wire.
      totalXp: Number(row.total_xp ?? 0),
      currentStreak: row.current_streak ?? 0,
      newBadges: Array.isArray(row.new_badges) ? row.new_badges : [],
    };
  } catch (err) {
    console.error('[xp] award_xp threw', err);
    return null;
  }
}

/** Calendar day in UTC -- the same day boundary award_xp() uses. */
export const utcDay = (at: Date = new Date()): string => at.toISOString().slice(0, 10);
