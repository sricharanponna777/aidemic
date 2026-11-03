'use client';

import Link from 'next/link';
import { Flame } from 'lucide-react';
import { useGamification } from '@/hooks/useGamification';
import { levelProgress } from '@/lib/gamification/levels';
import { MonoLabel, Meter } from '@/components/ui/telemetry';

const fmt = (n: number) => n.toLocaleString('en-GB');

/** Sidebar footer: level title, XP to the next level, streak and the bonus the
 *  next award gets. Students only -- the hook fetches nothing for anyone else. */
export function RankPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useGamification();
  if (!data) return null;

  const progress = levelProgress(data.totalXp);
  const streak = data.currentStreak;

  return (
    <Link
      href="/dashboard/progress"
      onClick={onNavigate}
      className="block rounded-xl border border-subtle bg-surface-sunken p-3.5 transition-colors hover:border-strong"
      aria-label={`Level ${progress.level} ${progress.title}. ${fmt(data.totalXp)} XP. Open progress.`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <MonoLabel>Mission rank</MonoLabel>
          <p className="mt-0.5 truncate text-sm font-semibold text-content">{progress.title}</p>
        </div>
        <span className="shrink-0 rounded-md border border-strong bg-surface px-1.5 py-0.5 font-mono text-[11px] font-semibold text-content">
          Lvl {progress.level}
        </span>
      </div>
      <Meter fraction={progress.fraction} className="mt-3" label="Progress to next level" />
      <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-content-subtle">
        <span>
          {fmt(data.totalXp)} / {fmt(progress.nextLevelAt)} XP
        </span>
        {streak > 0 ? (
          <span className="flex items-center gap-1 font-semibold text-warning" title={`${streak}-day streak, next XP x${data.nextMultiplier}`}>
            <Flame className="h-3 w-3" aria-hidden="true" />
            {streak}d{data.nextMultiplier > 1 ? ` · ${data.nextMultiplier}x` : ''}
          </span>
        ) : (
          <span>No streak</span>
        )}
      </div>
    </Link>
  );
}
