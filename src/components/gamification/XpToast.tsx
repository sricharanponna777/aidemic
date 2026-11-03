'use client';

import { useEffect, useRef, useState } from 'react';
import { Award, Flame, X, Zap } from 'lucide-react';
import type { EarnedBadge, XpAward } from '@/types';
import { XP_AWARDED_EVENT } from '@/lib/gamification/client';
import { levelForXp, rankTitle } from '@/lib/gamification/levels';

type Shown = {
  xp: number;
  multiplier: number;
  capped: boolean;
  /** Set when this burst of awards crossed a level boundary. */
  levelUp: { level: number; title: string } | null;
  badges: EarnedBadge[];
};

const DISMISS_AFTER_MS = 4500;

/**
 * What an award looked like, shown for a few seconds after a marking route
 * answers. Awards that arrive while it is up are merged into it -- a flashcard
 * session pays a few XP per card, and one toast per card would be noise.
 */
export function XpToast() {
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onAward = (event: Event) => {
      const award = (event as CustomEvent<XpAward>).detail;
      if (!award || award.duplicate || (award.xpAwarded <= 0 && !award.capped)) return;

      const before = levelForXp(award.totalXp - award.xpAwarded);
      const after = levelForXp(award.totalXp);
      setShown((prev) => ({
        xp: (prev?.xp ?? 0) + award.xpAwarded,
        multiplier: award.multiplier,
        capped: award.capped || (prev?.capped ?? false),
        levelUp: after > before ? { level: after, title: rankTitle(after) } : prev?.levelUp ?? null,
        badges: [...(prev?.badges ?? []), ...award.newBadges],
      }));

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setShown(null), DISMISS_AFTER_MS);
    };
    window.addEventListener(XP_AWARDED_EVENT, onAward);
    return () => {
      window.removeEventListener(XP_AWARDED_EVENT, onAward);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!shown) return null;

  return (
    <div aria-live="polite" className="fixed right-4 top-16 z-[90] w-72 print:hidden">
      <div role="status" className="animate-page-enter rounded-xl border border-subtle bg-surface-raised p-4 shadow-overlay">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-xp-muted text-xp">
              <Zap className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="font-mono text-xl font-semibold text-content">+{shown.xp.toLocaleString('en-GB')} XP</p>
          </div>
          <button
            type="button"
            onClick={() => setShown(null)}
            aria-label="Dismiss"
            className="rounded-md p-1 text-content-subtle hover:bg-surface-sunken hover:text-content"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 space-y-1 text-[13px] text-content-muted">
          {shown.multiplier > 1 && (
            <p className="flex items-center gap-1.5 text-warning">
              <Flame className="h-3.5 w-3.5" aria-hidden="true" /> Streak bonus x{shown.multiplier}
            </p>
          )}
          {shown.capped && <p>Daily XP limit reached. More tomorrow.</p>}
          {shown.levelUp && (
            <p className="font-semibold text-content">
              Level up! You are now level {shown.levelUp.level}: {shown.levelUp.title}
            </p>
          )}
          {shown.badges.map((badge) => (
            <p key={badge.id} className="flex items-center gap-1.5 font-semibold text-success">
              <Award className="h-3.5 w-3.5" aria-hidden="true" /> Badge earned: {badge.name}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
