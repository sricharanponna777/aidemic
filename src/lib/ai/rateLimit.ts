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
} as const;

// When the rate-limit RPC errors we fail OPEN by default: a transient DB hiccup
// shouldn't take down every AI feature. Deployments that would rather cap cost
// than stay available can set AI_RATE_LIMIT_FAIL_CLOSED=true to reject instead.
const FAIL_CLOSED = process.env.AI_RATE_LIMIT_FAIL_CLOSED === 'true';

/** Atomically increments today's usage counter via the increment_ai_usage() RPC
 * and reports whether this request is still under the caller's daily limit. */
export async function checkAiRateLimit(
  supabase: SupabaseClient,
  dailyLimit: number
): Promise<{ allowed: boolean; currentCount: number }> {
  const { data, error } = await supabase.rpc('increment_ai_usage', { p_daily_limit: dailyLimit });
  if (error || !data || data.length === 0) {
    console.error('[rateLimit] increment_ai_usage failed', error);
    return { allowed: !FAIL_CLOSED, currentCount: 0 };
  }

  const row = data[0] as { allowed: boolean; current_count: number };
  return { allowed: row.allowed, currentCount: row.current_count };
}
