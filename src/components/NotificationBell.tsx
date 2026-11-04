'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Bell, /* GAMIFICATION PAUSED: TrendingUp, */ UserPlus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { fetchNotifications, readSeenAt, writeSeenAt, type AppNotification } from '@/lib/notifications';
// GAMIFICATION PAUSED: import { BadgeIcon } from '@/components/gamification/BadgeIcon';
import { MonoLabel } from '@/components/ui/telemetry';

const ago = (iso: string, now: number) => {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return minutes <= 1 ? 'just now' : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

function ItemIcon({ item }: { item: AppNotification }) {
  const cls = 'h-4 w-4';
  // GAMIFICATION PAUSED: if (item.kind === 'badge') return <BadgeIcon name={item.icon ?? 'award'} className={cls} />;
  // GAMIFICATION PAUSED: if (item.kind === 'league') return <TrendingUp className={cls} aria-hidden="true" />;
  void item;
  return <UserPlus className={cls} aria-hidden="true" />;
}

/** Top-bar bell for students: badges earned, league results, parent link
 *  requests. Keyed under 'gamification' so an award refreshes it. */
export function NotificationBell() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const { data: items } = useSWR(userId ? ['gamification', 'notifications', userId] : null, () =>
    fetchNotifications(createClient())
  );
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(() => (userId ? readSeenAt(userId) : 0));
  // Captured when the panel opens, so items stay marked "new" while it is
  // being read and only clear next time.
  const [openedAt, setOpenedAt] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => {
      setSeenAt(openedAt);
      setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, openedAt]);

  const isNew = (item: AppNotification) => new Date(item.at).getTime() > seenAt;
  const unread = (items ?? []).filter(isNew).length;

  const toggle = () => {
    if (!open) {
      const now = Date.now();
      setOpenedAt(now);
      if (userId) writeSeenAt(userId, now);
    } else {
      setSeenAt(openedAt);
    }
    setOpen(!open);
  };

  const close = () => {
    setSeenAt(openedAt);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-subtle bg-surface text-content-muted transition-colors hover:border-strong hover:text-content"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-xp ring-2 ring-surface" aria-hidden="true" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-subtle bg-surface-raised shadow-overlay"
        >
          <div className="border-b border-subtle px-4 py-3">
            <MonoLabel>Incoming transmissions</MonoLabel>
          </div>
          {!items ? (
            <div className="m-4 h-12 animate-pulse rounded bg-surface-sunken" />
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-center text-body text-content-subtle">
              {/* GAMIFICATION PAUSED: Nothing yet. Badges you earn and your weekly league results show up here. */}
              Nothing yet. Parent link requests show up here.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-subtle overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} onClick={close} className="flex gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface text-content-muted">
                      <ItemIcon item={item} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-content">{item.title}</span>
                        {isNew(item) && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-xp" aria-label="New" />}
                      </span>
                      <span className="block text-[13px] text-content-subtle">{item.body}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-content-subtle">{ago(item.at, openedAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
