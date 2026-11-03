import type { SupabaseClient } from '@supabase/supabase-js';
import { leagueLabel } from '@/lib/gamification/leagues';

/**
 * The bell's feed: `my_notifications()` rows (migration 20261103020000) turned
 * into plain-English lines. The RPC returns facts only, so every word a
 * student reads is written here.
 */

export type NotificationKind = 'badge' | 'league' | 'parent_link';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  at: string;
  title: string;
  body: string;
  href: string;
  /** Lucide name, for badges. */
  icon?: string;
}

type Row = { id: string; kind: string; at: string; data: Record<string, unknown> | null };

const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
};

export function describeNotification(row: Row): AppNotification | null {
  const data = row.data ?? {};
  const base = { id: row.id, at: row.at };

  if (row.kind === 'badge') {
    return {
      ...base,
      kind: 'badge',
      title: `Badge earned: ${String(data.name ?? '')}`,
      body: String(data.description ?? ''),
      href: '/dashboard/progress',
      icon: String(data.icon ?? 'award'),
    };
  }

  if (row.kind === 'league') {
    const to = leagueLabel(String(data.to_tier ?? ''));
    const title =
      data.result === 'promoted' ? `You moved up to the ${to}` : data.result === 'demoted' ? `You moved down to the ${to}` : `You stayed in the ${to}`;
    const rank = Number(data.rank);
    const size = Number(data.cohort_size);
    return {
      ...base,
      kind: 'league',
      title,
      body: Number.isFinite(rank) && Number.isFinite(size) ? `You finished ${ordinal(rank)} of ${size} last week.` : 'Last week is over.',
      href: '/dashboard/progress',
    };
  }

  if (row.kind === 'parent_link') {
    return {
      ...base,
      kind: 'parent_link',
      title: 'A parent asked to link to your account',
      body: 'Accept or decline it on the Link Parent page.',
      href: '/dashboard/family',
    };
  }

  return null;
}

export async function fetchNotifications(supabase: SupabaseClient): Promise<AppNotification[]> {
  const { data, error } = await supabase.rpc('my_notifications', { p_limit: 20 });
  if (error) throw error;
  return ((data ?? []) as Row[]).flatMap((row) => describeNotification(row) ?? []);
}

/** When this browser last opened the bell. Per device by design: nothing in
 *  the feed is lost by being "read" twice. Unreadable storage means "never",
 *  so new items still show their dot. */
const seenKey = (userId: string) => `aidemic-notifications-seen:${userId}`;

export const readSeenAt = (userId: string): number => {
  try {
    return Number(window.localStorage.getItem(seenKey(userId))) || 0;
  } catch {
    return 0;
  }
};

export const writeSeenAt = (userId: string, at: number): void => {
  try {
    window.localStorage.setItem(seenKey(userId), String(at));
  } catch {
    // Storage blocked: the dots just come back next visit.
  }
};
