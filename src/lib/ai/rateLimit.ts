import type { SupabaseClient } from '@supabase/supabase-js';

// Per-user daily request caps for each AI route, sized to the actual cost of
// a single call (generate-questions can trigger ~5 model calls + web search;
// generate-podcast fans out up to 14 TTS calls).
export const AI_DAILY_LIMITS = {
  generateQuestions: 30,
  generateFlashcards: 30,
  generateVideo: 30,
  generatePodcast: 5,
  markAnswers: 60,
  studyChat: 100,
  classSummary: 20,
  examCoach: 15,
  blurtReview: 20,
  transcribeScan: 30,
} as const;

// What to do when the rate-limit RPC itself errors. Failing OPEN turns a database
// hiccup into an uncapped bill -- every AI route calls a paid provider, so an
// attacker who can make the RPC fail gets unlimited generations. Production
// therefore fails CLOSED by default; dev stays open so a local database without
// the RPC doesn't block every feature. AI_RATE_LIMIT_FAIL_CLOSED overrides both.
const failClosed = (): boolean => {
  const configured = process.env.AI_RATE_LIMIT_FAIL_CLOSED?.trim();
  if (configured) return configured === 'true';
  return process.env.NODE_ENV === 'production';
};

/** Atomically increments today's usage counter via the increment_ai_usage() RPC
 * and reports whether this request is still under the caller's daily limit. */
export async function checkAiRateLimit(
  supabase: SupabaseClient,
  dailyLimit: number
): Promise<{ allowed: boolean; currentCount: number }> {
  const { data, error } = await supabase.rpc('increment_ai_usage', { p_daily_limit: dailyLimit });
  if (error || !data || data.length === 0) {
    console.error('[rateLimit] increment_ai_usage failed', error);
    return { allowed: !failClosed(), currentCount: 0 };
  }

  const row = data[0] as { allowed: boolean; current_count: number };
  return { allowed: row.allowed, currentCount: row.current_count };
}
