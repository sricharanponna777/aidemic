'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { EmptyState } from '@/components/ui/feedback';
import { PageLoader } from '@/components/PageLoader';

/** Helpers shared by the school admin workspace pages (/dashboard/school/*). */

export const displayName = (row: { full_name: string | null; email: string | null }, fallback: string) =>
  row.full_name?.trim() || row.email || fallback;

export const formatPercent = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${Math.round(Number(value))}%`;

/** completed / expected as a 0..1 fraction, or null when nothing was expected. */
export const completionFraction = (completed: number, expected: number) =>
  expected > 0 ? Math.min(1, completed / expected) : null;

const DAY = 24 * 60 * 60 * 1000;

/** "Today", "3 days ago", "12 Oct" -- compact enough for a table cell. */
export function formatRelativeDay(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined });
}

/** Loading and error states for a workspace page whose data has not arrived. */
export function SchoolDataState({ isLoading, error }: { isLoading: boolean; error: unknown }) {
  if (isLoading) return <PageLoader />;
  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load your school"
        description={
          error instanceof Error && /not a school admin/i.test(error.message)
            ? 'Your account is not an approved school admin.'
            : 'Something went wrong loading this page. Refresh to try again.'
        }
      />
    );
  }
  return null;
}

/** The search box above a staff, class or student list. */
export function ListSearch({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-5 py-3">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-subtle" />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full rounded-lg border border-subtle bg-surface py-2 pl-9 pr-3 text-sm text-content outline-none focus:border-accent"
        />
      </div>
      {children}
    </div>
  );
}

/** Pill tabs for filtering a list ("Pending 3 · Approved 12"). */
export function FilterTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 rounded-lg border border-subtle bg-surface-sunken p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              active ? 'bg-surface text-content shadow-card' : 'text-content-subtle hover:text-content'
            }`}
          >
            {option.label}
            {option.count !== undefined && <span className="font-mono text-[11px] text-content-subtle">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
