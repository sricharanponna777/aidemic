'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Rocket, X } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import type { ChecklistItem } from '@/lib/onboarding/checklist';

/**
 * The first-run checklist on the dashboard. Hides itself once every step is
 * done, so a returning user never has to dismiss it — the X is for people who
 * want it gone sooner, and that choice is stored on the profile rather than in
 * localStorage so it holds across devices.
 */
export function GetStartedChecklist({ items, loading = false }: { items: ChecklistItem[]; loading?: boolean }) {
  const { session, profile, isProfileLoading } = useAuth();
  const supabase = createClient();
  const [isDismissed, setIsDismissed] = useState(false);

  const doneCount = items.filter((item) => item.done).length;
  const nextItem = items.find((item) => !item.done);

  // Held until the profile lands: rendering on a null profile flashes the
  // checklist at users who dismissed it months ago.
  if (loading || isProfileLoading || isDismissed) return null;
  if (profile?.onboarding_checklist_dismissed_at) return null;
  if (items.length === 0 || !nextItem) return null;

  const dismiss = async () => {
    setIsDismissed(true);
    if (!session?.user?.id) return;
    const { error } = await supabase
      .from('user_profiles')
      .update({ onboarding_checklist_dismissed_at: new Date().toISOString() })
      .eq('id', session.user.id);
    if (error) console.error('Failed to dismiss the get-started checklist:', error.message);
  };

  return (
    <section className="overflow-hidden rounded-card border border-subtle bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-subtle bg-surface-sunken px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-accent-muted text-accent">
          <Rocket className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-title text-content">Get started</h2>
          <p className="text-body text-content-subtle">
            {doneCount === 0
              ? 'Five minutes of setup and AIDemic starts working from your own results.'
              : `Next up: ${nextItem.title.toLowerCase()}.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-body font-semibold text-content-muted">
            {doneCount} of {items.length} done
          </span>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Hide the get-started checklist"
            className={buttonStyles({ variant: 'ghost', size: 'icon' })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="h-1 w-full bg-surface-sunken">
        <div
          className="h-full bg-accent transition-all duration-500"
          style={{ width: `${Math.round((doneCount / items.length) * 100)}%` }}
        />
      </div>

      <ol className="divide-y divide-subtle">
        {items.map((item) => {
          const Icon = item.icon;
          const isNext = item.id === nextItem.id;
          return (
            <li
              key={item.id}
              className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${isNext ? 'bg-accent-muted/40' : ''}`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  item.done ? 'bg-success text-white' : 'bg-surface-sunken text-content-subtle'
                }`}
              >
                {item.done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>

              <div className="min-w-0 flex-1">
                <p className={`text-body font-semibold ${item.done ? 'text-content-subtle line-through' : 'text-content'}`}>
                  {item.title}
                </p>
                {!item.done && <p className="text-body text-content-subtle">{item.body}</p>}
              </div>

              {!item.done && (
                <Link
                  href={item.href}
                  className={buttonStyles({ variant: isNext ? 'primary' : 'secondary', size: 'sm' })}
                >
                  {item.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
