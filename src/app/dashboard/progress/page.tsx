'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Clock, Flame, Lock, Trophy, Zap } from 'lucide-react';
import { useBadges, useGamification, useLeague } from '@/hooks/useGamification';
import { RANK_TITLES, levelProgress, nextRank } from '@/lib/gamification/levels';
import { LEAGUE_TIERS, leagueLabel, leagueTier } from '@/lib/gamification/leagues';
import { DAILY_XP_CAP, STREAK_MULTIPLIERS, XP_RATES } from '@/lib/gamification/rules';
import { timeUntil } from '@/lib/gamification/client';
import { BadgeIcon } from '@/components/gamification/BadgeIcon';
import { Chip, Meter, MonoLabel, Panel } from '@/components/ui/telemetry';
import { PageLoader } from '@/components/PageLoader';
import type { LeagueSnapshot } from '@/types';

const fmt = (n: number) => n.toLocaleString('en-GB');

/** Re-render once a minute so the week countdown moves. */
const useNow = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
};

function LeagueTable({ league }: { league: LeagueSnapshot }) {
  const tier = leagueTier(league.tier);
  const up = LEAGUE_TIERS.find((t) => t.tier === league.tier + 1);
  const down = LEAGUE_TIERS.find((t) => t.tier === league.tier - 1);

  if (!league.placed) {
    return (
      <div className="rounded-lg border border-dashed border-strong bg-surface-sunken px-4 py-8 text-center">
        <p className="font-semibold text-content">You haven&apos;t joined this week&apos;s league yet</p>
        <p className="mx-auto mt-1 max-w-sm text-body text-content-subtle">
          Earn any XP this week and you&apos;ll be put in a group of up to 30 students in the {leagueLabel(tier.name)}.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mb-3 text-[13px] text-content-subtle">
        {league.promoteCount > 0 && up && (
          <>
            Top {league.promoteCount} move up to the <span className="font-semibold text-success">{leagueLabel(up.name)}</span>.{' '}
          </>
        )}
        {league.demoteCount > 0 && down && (
          <>
            Bottom {league.demoteCount} move down to the <span className="font-semibold text-danger">{leagueLabel(down.name)}</span>.
          </>
        )}
      </p>
      <ol className="divide-y divide-subtle overflow-hidden rounded-lg border border-subtle">
        {league.members.map((m) => (
          <li
            key={m.rank}
            className={`flex items-center gap-3 px-3 py-2 text-sm ${m.isMe ? 'bg-accent-muted font-semibold' : ''} ${
              m.zone === 'promote' ? 'border-l-2 border-l-success' : m.zone === 'demote' ? 'border-l-2 border-l-danger' : 'border-l-2 border-l-transparent'
            }`}
          >
            <span className="w-6 font-mono text-[13px] text-content-subtle">{m.rank}</span>
            <span className="min-w-0 flex-1 truncate text-content">
              {m.displayName}
              {m.isMe && <span className="ml-1.5 text-[13px] font-normal text-content-subtle">(you)</span>}
            </span>
            {m.zone === 'promote' && <ArrowUp className="h-3.5 w-3.5 text-success" aria-label="Moving up" />}
            {m.zone === 'demote' && <ArrowDown className="h-3.5 w-3.5 text-danger" aria-label="Moving down" />}
            <span className="w-20 text-right font-mono text-[13px] text-content-muted">{fmt(m.weeklyXp)} XP</span>
          </li>
        ))}
      </ol>
    </>
  );
}

export default function ProgressPage() {
  const { data: summary, error } = useGamification();
  const { data: league } = useLeague();
  const { data: badges } = useBadges();
  const now = useNow();

  if (error) {
    return (
      <Panel>
        <p className="text-body text-danger">Couldn&apos;t load your progress. Refresh to try again.</p>
      </Panel>
    );
  }
  if (!summary) return <PageLoader />;

  const progress = levelProgress(summary.totalXp);
  const upcoming = nextRank(progress.level);
  const currentTier = summary.league.tier;
  const earned = badges?.filter((b) => b.earnedAt).length ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="rounded-card border border-subtle bg-surface p-6">
        <MonoLabel>Mission log</MonoLabel>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-display text-content">Your progress</h1>
            <p className="mt-1 max-w-xl text-body text-content-muted">
              Your level goes up with every bit of XP and never goes down. Your league resets every Monday: finish near the top
              to move up a league.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip tone="xp">
              <Zap className="h-3 w-3" /> {fmt(summary.totalXp)} XP total
            </Chip>
            <Chip>
              Today {fmt(summary.todayXp)} / {fmt(summary.dailyCap)}
            </Chip>
            <Chip tone={summary.currentStreak > 0 ? 'warning' : 'neutral'}>
              <Flame className="h-3 w-3" /> {summary.currentStreak}-day streak
            </Chip>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        {/* League */}
        <div className="space-y-5">
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <MonoLabel>This week&apos;s league</MonoLabel>
                <p className="mt-1 text-title text-content">{leagueLabel(summary.league.name)}</p>
                <p className="text-[13px] text-content-subtle">{leagueTier(currentTier).blurb}</p>
              </div>
              <Chip>
                <Clock className="h-3 w-3" /> Ends in {timeUntil(summary.league.weekEndsAt, now)}
              </Chip>
            </div>
            <div className="mt-4">{league ? <LeagueTable league={league} /> : <div className="h-24" />}</div>
          </Panel>

          <Panel>
            <MonoLabel>All leagues, smallest to biggest</MonoLabel>
            <ol className="mt-3 space-y-1">
              {[...LEAGUE_TIERS].reverse().map((t) => {
                const here = t.tier === currentTier;
                const passed = t.tier < currentTier;
                return (
                  <li
                    key={t.tier}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 ${here ? 'bg-accent text-accent-fg' : ''}`}
                  >
                    <span className={`w-5 font-mono text-xs ${here ? 'text-accent-fg/70' : 'text-content-subtle'}`}>{t.tier}</span>
                    <span className={`w-28 shrink-0 text-sm font-semibold ${here ? '' : passed ? 'text-content-muted' : 'text-content'}`}>
                      {t.name}
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-[13px] ${here ? 'text-accent-fg/80' : 'text-content-subtle'}`}>
                      {t.blurb}
                    </span>
                    {here && <span className="font-mono text-[11px] uppercase tracking-wider">You</span>}
                  </li>
                );
              })}
            </ol>
          </Panel>
        </div>

        {/* Level + streak */}
        <div className="space-y-5">
          <Panel>
            <div className="flex items-start justify-between gap-3">
              <div>
                <MonoLabel>Mission rank</MonoLabel>
                <p className="mt-1 text-title text-content">{progress.title}</p>
                <p className="text-[13px] text-content-subtle">{progress.blurb}</p>
              </div>
              <span className="rounded-md border border-strong px-2 py-1 font-mono text-sm font-semibold text-content">
                Lvl {progress.level}
              </span>
            </div>
            <Meter fraction={progress.fraction} className="mt-4" label="Progress to next level" />
            <div className="mt-2 flex justify-between font-mono text-xs text-content-subtle">
              <span>
                {fmt(progress.xpIntoLevel)} / {fmt(progress.xpForNextLevel)} XP
              </span>
              <span>Level {progress.level + 1} next</span>
            </div>
            {upcoming && (
              <p className="mt-3 text-[13px] text-content-muted">
                Next title: <span className="font-semibold text-content">{upcoming.title}</span> at level {upcoming.fromLevel}.
              </p>
            )}
            <ol className="mt-4 space-y-1 border-t border-subtle pt-3">
              {RANK_TITLES.map((rank) => {
                const unlocked = progress.level >= rank.fromLevel;
                const current = rank.title === progress.title;
                return (
                  <li key={rank.title} className="flex items-center gap-2.5 py-0.5 text-sm">
                    {unlocked ? (
                      <Check className={`h-3.5 w-3.5 ${current ? 'text-content' : 'text-success'}`} aria-label="Unlocked" />
                    ) : (
                      <Lock className="h-3.5 w-3.5 text-content-subtle" aria-label="Locked" />
                    )}
                    <span className={`flex-1 ${current ? 'font-semibold text-content' : unlocked ? 'text-content-muted' : 'text-content-subtle'}`}>
                      {rank.title}
                    </span>
                    <span className="font-mono text-xs text-content-subtle">Lvl {rank.fromLevel}</span>
                  </li>
                );
              })}
            </ol>
          </Panel>

          <Panel>
            <MonoLabel>Streak bonus</MonoLabel>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-subtle p-3">
                <p className="text-[13px] text-content-subtle">Current streak</p>
                <p className="mt-0.5 text-title text-warning">{summary.currentStreak} {summary.currentStreak === 1 ? 'day' : 'days'}</p>
              </div>
              <div className="rounded-lg border border-subtle p-3">
                <p className="text-[13px] text-content-subtle">Best ever</p>
                <p className="mt-0.5 text-title text-content">{summary.longestStreak} {summary.longestStreak === 1 ? 'day' : 'days'}</p>
              </div>
            </div>
            <p className="mt-3 text-[13px] text-content-muted">
              Earn XP every day to keep your streak going. A longer streak multiplies all the XP you earn. Days end at
              midnight UK winter time (1am in summer).
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {STREAK_MULTIPLIERS.slice(1).map((s) => (
                <Chip key={s.fromDays} tone={summary.nextMultiplier >= s.multiplier ? 'warning' : 'neutral'}>
                  {s.fromDays}+ days: x{s.multiplier}
                </Chip>
              ))}
            </div>
          </Panel>

          <Panel>
            <MonoLabel>How XP works</MonoLabel>
            <ul className="mt-3 space-y-1.5 text-sm">
              {XP_RATES.map((rate) => (
                <li key={rate.source} className="flex justify-between gap-3">
                  <span className="text-content-muted">{rate.label}</span>
                  <span className="font-mono text-[13px] text-content">
                    {rate.perMark ? `${rate.xp} per mark` : `up to ${rate.xp}`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-content-subtle">
              Better answers earn more: full marks earns five times as much as zero marks. You can earn up to{' '}
              {fmt(DAILY_XP_CAP)} XP a day.
            </p>
          </Panel>
        </div>
      </div>

      {/* Badges */}
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <MonoLabel>Badges</MonoLabel>
          {badges && (
            <span className="font-mono text-xs text-content-subtle">
              {earned} / {badges.length} earned
            </span>
          )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(badges ?? []).map((badge) => {
            const done = !!badge.earnedAt;
            return (
              <div
                key={badge.id}
                className={`rounded-lg border p-3 ${done ? 'border-success/30 bg-success-muted' : 'border-subtle bg-surface-sunken'}`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      done ? 'bg-success text-accent-fg' : 'border border-subtle bg-surface text-content-subtle'
                    }`}
                  >
                    <BadgeIcon name={badge.icon} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-semibold ${done ? 'text-content' : 'text-content-muted'}`}>{badge.name}</p>
                    <p className="truncate text-[13px] text-content-subtle">{badge.description}</p>
                  </div>
                </div>
                {done ? (
                  <p className="mt-2.5 flex items-center gap-1 font-mono text-xs text-success">
                    <Trophy className="h-3 w-3" /> Earned{' '}
                    {new Date(badge.earnedAt as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </p>
                ) : (
                  <div className="mt-2.5">
                    <Meter fraction={badge.progress / badge.threshold} tone="xp" label={`${badge.name} progress`} />
                    <p className="mt-1 font-mono text-xs text-content-subtle">
                      {fmt(badge.progress)} / {fmt(badge.threshold)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
