'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { fetchClassLeaderboard } from '@/lib/gamification/client';
import { levelForXp, rankTitle } from '@/lib/gamification/levels';
import { MonoLabel } from '@/components/ui/telemetry';

type Period = 'week' | 'all_time';

/**
 * XP standings for one class, with REAL names: class_leaderboard() only
 * answers an active member of the class or its own teacher, who already know
 * each other. Weekly leagues, which mix schools, never show names.
 */
export function ClassLeaderboard({ classId }: { classId: string }) {
  const [period, setPeriod] = useState<Period>('week');
  // Keyed under 'gamification' so an XP award anywhere refreshes it too.
  const { data: rows, error } = useSWR(['gamification', 'class', classId, period], () =>
    fetchClassLeaderboard(createClient(), classId, period)
  );

  return (
    <section className="rounded-card border border-subtle bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-content-subtle" />
          <MonoLabel>Class leaderboard</MonoLabel>
        </div>
        <div className="flex rounded-lg border border-subtle p-0.5" role="group" aria-label="Period">
          {(['week', 'all_time'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={`rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
                period === p ? 'bg-accent text-accent-fg' : 'text-content-subtle hover:text-content'
              }`}
            >
              {p === 'week' ? 'This week' : 'All time'}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="mt-4 text-body text-danger">Couldn&apos;t load the leaderboard.</p>
      ) : !rows ? (
        <div className="mt-4 h-20 animate-pulse rounded-lg bg-surface-sunken" />
      ) : rows.length === 0 ? (
        <p className="mt-4 text-body text-content-subtle">No students in this class yet.</p>
      ) : (
        <ol className="mt-4 divide-y divide-subtle overflow-hidden rounded-lg border border-subtle">
          {rows.map((row) => {
            const level = levelForXp(row.totalXp);
            return (
              <li key={row.studentId} className={`flex items-center gap-3 px-3 py-2 text-sm ${row.isMe ? 'bg-accent-muted' : ''}`}>
                <span className="w-6 font-mono text-[13px] text-content-subtle">{row.rank}</span>
                <span className={`min-w-0 flex-1 truncate ${row.isMe ? 'font-semibold text-content' : 'text-content'}`}>
                  {row.displayName}
                  {row.isMe && <span className="ml-1.5 text-[13px] font-normal text-content-subtle">(you)</span>}
                </span>
                <span className="hidden font-mono text-xs text-content-subtle sm:inline">
                  Lvl {level} · {rankTitle(level)}
                </span>
                <span className="w-20 text-right font-mono text-[13px] text-content-muted">{row.xp.toLocaleString('en-GB')} XP</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
