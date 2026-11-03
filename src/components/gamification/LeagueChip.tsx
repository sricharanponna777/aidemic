'use client';

import Link from 'next/link';
import { useGamification } from '@/hooks/useGamification';
import { leagueLabel } from '@/lib/gamification/leagues';

const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
};

/** Top-bar status: this week's league and where the student stands in it. */
export function LeagueChip() {
  const { data } = useGamification();
  if (!data) return null;
  const { league } = data;

  return (
    <Link
      href="/dashboard/progress"
      className="hidden items-center gap-2 rounded-md border border-subtle bg-surface px-2.5 py-1 font-mono text-[11px] text-content-muted transition-colors hover:border-strong hover:text-content md:flex"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${league.placed ? 'bg-success' : 'bg-content-subtle'}`} aria-hidden="true" />
      {leagueLabel(league.name)}
      <span className="text-content-subtle">
        {league.placed && league.rank != null
          ? `· ${ordinal(league.rank)} of ${league.cohortSize}`
          : '· earn XP to join this week'}
      </span>
    </Link>
  );
}
