import type { SupabaseClient } from '@supabase/supabase-js';

export interface StudyGoals {
  daily_card_target: number;
  weekly_minute_target: number;
}

/** Mirrors the column defaults in 20260725000000_add_study_goals.sql. Used when
 *  a user has never saved goals, so the dashboard always has a target to show. */
export const DEFAULT_STUDY_GOALS: StudyGoals = {
  daily_card_target: 20,
  weekly_minute_target: 150,
};

export const DAILY_CARD_TARGET_RANGE = { min: 1, max: 500 } as const;
export const WEEKLY_MINUTE_TARGET_RANGE = { min: 5, max: 10000 } as const;

export function clampGoals(goals: StudyGoals): StudyGoals {
  const clamp = (value: number, { min, max }: { min: number; max: number }, fallback: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

  return {
    daily_card_target: clamp(
      goals.daily_card_target,
      DAILY_CARD_TARGET_RANGE,
      DEFAULT_STUDY_GOALS.daily_card_target
    ),
    weekly_minute_target: clamp(
      goals.weekly_minute_target,
      WEEKLY_MINUTE_TARGET_RANGE,
      DEFAULT_STUDY_GOALS.weekly_minute_target
    ),
  };
}

/** Reads a user's goals, falling back to the defaults when no row exists.
 *  Never throws — a goals lookup should not be able to break a dashboard. */
export async function fetchStudyGoals(
  supabase: SupabaseClient,
  userId: string
): Promise<StudyGoals> {
  const { data, error } = await supabase
    .from('study_goals')
    .select('daily_card_target, weekly_minute_target')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return DEFAULT_STUDY_GOALS;
  return clampGoals(data as StudyGoals);
}

export async function saveStudyGoals(
  supabase: SupabaseClient,
  userId: string,
  goals: StudyGoals
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('study_goals')
    .upsert({ user_id: userId, ...clampGoals(goals) }, { onConflict: 'user_id' });

  return { error: error?.message ?? null };
}
