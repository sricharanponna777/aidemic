import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BadgeProgress,
  ClassLeaderboardRow,
  GamificationSummary,
  LeagueSnapshot,
  LeagueStanding,
  XpAward,
} from '@/types';

/**
 * Browser side of gamification: the read RPCs, mapped onto camelCase, and the
 * event that tells the shell an award just landed.
 *
 * Nothing here writes. XP only moves through award_xp() on the server; a page
 * that receives an `xp` object from a marking route passes it to announceXp(),
 * which shows it and refetches -- it never adds it to anything locally.
 */

export const XP_AWARDED_EVENT = 'aidemic:xp-awarded';

const num = (value: unknown, fallback = 0): number => {
  // bigint columns arrive as strings over the wire.
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : fallback;
};

const isXpAward = (value: unknown): value is XpAward =>
  !!value && typeof value === 'object' && typeof (value as XpAward).xpAwarded === 'number';

/** Hand a marking route's `xp` field to the shell. Ignores anything that is
 *  not an award (null when award_xp failed, undefined from older responses). */
export function announceXp(value: unknown): void {
  if (typeof window === 'undefined' || !isXpAward(value)) return;
  window.dispatchEvent(new CustomEvent<XpAward>(XP_AWARDED_EVENT, { detail: value }));
}

type Row = Record<string, unknown>;

export async function fetchGamification(supabase: SupabaseClient): Promise<GamificationSummary> {
  const { data, error } = await supabase.rpc('my_gamification');
  if (error) throw error;
  const row = (data ?? {}) as Row;
  const league = (row.league ?? {}) as Row;
  return {
    totalXp: num(row.total_xp),
    currentStreak: num(row.current_streak),
    longestStreak: num(row.longest_streak),
    todayXp: num(row.today_xp),
    dailyCap: num(row.daily_cap, 3000),
    nextMultiplier: num(row.next_multiplier, 1),
    league: {
      tier: num(league.tier, 1),
      slug: String(league.slug ?? 'rock'),
      name: String(league.name ?? 'Rock'),
      placed: Boolean(league.placed),
      weeklyXp: num(league.weekly_xp),
      rank: league.rank == null ? null : num(league.rank),
      cohortSize: league.cohort_size == null ? null : num(league.cohort_size),
      weekEndsAt: String(league.week_ends_at ?? ''),
    },
  };
}

export async function fetchLeague(supabase: SupabaseClient): Promise<LeagueSnapshot> {
  const { data, error } = await supabase.rpc('my_league');
  if (error) throw error;
  const row = (data ?? {}) as Row;
  const members = Array.isArray(row.members) ? (row.members as Row[]) : [];
  return {
    placed: Boolean(row.placed),
    tier: num(row.tier, 1),
    slug: String(row.slug ?? 'rock'),
    name: String(row.name ?? 'Rock'),
    weekEndsAt: String(row.week_ends_at ?? ''),
    promoteCount: num(row.promote_count),
    demoteCount: num(row.demote_count),
    members: members.map(
      (m): LeagueStanding => ({
        rank: num(m.rank),
        displayName: String(m.display_name ?? ''),
        weeklyXp: num(m.weekly_xp),
        isMe: Boolean(m.is_me),
        zone: m.zone === 'promote' || m.zone === 'demote' ? m.zone : 'safe',
      })
    ),
  };
}

export async function fetchBadges(supabase: SupabaseClient): Promise<BadgeProgress[]> {
  const { data, error } = await supabase.rpc('my_badges');
  if (error) throw error;
  return ((data ?? []) as Row[]).map((b) => ({
    id: String(b.id),
    name: String(b.name),
    description: String(b.description),
    icon: String(b.icon),
    criterion: String(b.criterion),
    threshold: num(b.threshold, 1),
    progress: num(b.progress),
    earnedAt: b.earned_at ? String(b.earned_at) : null,
  }));
}

export async function fetchClassLeaderboard(
  supabase: SupabaseClient,
  classId: string,
  period: 'week' | 'all_time'
): Promise<ClassLeaderboardRow[]> {
  const { data, error } = await supabase.rpc('class_leaderboard', { p_class_id: classId, p_period: period });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    rank: num(r.rank),
    studentId: String(r.student_id),
    displayName: String(r.display_name ?? 'Student'),
    xp: num(r.xp),
    totalXp: num(r.total_xp),
    isMe: Boolean(r.is_me),
  }));
}

/** The unearned badge closest to done, by fraction complete. */
export function nextBadge(badges: BadgeProgress[], criterion?: (b: BadgeProgress) => boolean): BadgeProgress | null {
  let best: BadgeProgress | null = null;
  for (const badge of badges) {
    if (badge.earnedAt || (criterion && !criterion(badge))) continue;
    if (!best || badge.progress / badge.threshold > best.progress / best.threshold) best = badge;
  }
  return best;
}

/** "2d 4h" / "5h 12m" until `iso`, for the league week countdown. */
export function timeUntil(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return '0m';
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${minutes % 60}m`;
}
