'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { groupQualifications, type QualificationDef, type QualificationGroup } from '@/lib/ai/qualifications';

const triggerClass =
  'flex w-full items-center justify-between gap-2 rounded-lg border border-subtle bg-surface px-3 py-2 text-left text-sm text-content outline-none focus:border-accent';

const optionClass = (active: boolean) =>
  `block w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
    active ? 'bg-accent-muted font-medium text-accent' : 'text-content hover:bg-surface-sunken dark:hover:bg-surface/6'
  }`;

type FlyoutState = { group: QualificationGroup; top: number; left: number };

/** Qualification picker for the "long list" case (16+ India entrance exams alongside the
 * school boards): closed, it shows only the current selection; open with no search text, it
 * shows just the four category headings, and hovering (or clicking, for touch/keyboard) one
 * flies out that category's qualifications rather than dumping everything in one list. Typing
 * a search switches to a flat, already-filtered list across every category.
 *
 * The flyout is rendered through a portal at a `fixed` position (matching the sidebar's
 * GroupFlyout in dashboard/layout.tsx) rather than nested `absolute` inside the panel — a
 * nested flyout gets clipped by the panel's own `overflow-y-auto` once a category (e.g.
 * Engineering Entrance, 11 entries) is taller than the panel. */
export function QualificationPicker({
  qualifications,
  value,
  onChange,
  className = '',
}: {
  qualifications: readonly QualificationDef[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [flyout, setFlyout] = useState<FlyoutState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = qualifications.find((qual) => qual.id === value) ?? null;

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (flyoutRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const cancelFlyoutClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleFlyoutClose = () => {
    cancelFlyoutClose();
    closeTimer.current = setTimeout(() => setFlyout(null), 150);
  };

  const FLYOUT_MAX_HEIGHT = 320; // matches max-h-80
  const VIEWPORT_MARGIN = 8;

  const openFlyout = (group: QualificationGroup, target: HTMLElement) => {
    cancelFlyoutClose();
    const rect = target.getBoundingClientRect();
    const top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rect.top, window.innerHeight - FLYOUT_MAX_HEIGHT - VIEWPORT_MARGIN - 32),
    );
    setFlyout({ group, top, left: rect.right + 4 });
  };

  const close = () => {
    setIsOpen(false);
    setFlyout(null);
    setSearch('');
  };

  const select = (id: string) => {
    onChange(id);
    close();
  };

  const query = search.trim().toLowerCase();
  const filtered = query ? qualifications.filter((qual) => qual.label.toLowerCase().includes(query)) : qualifications;
  const groups = groupQualifications(filtered);
  const flyoutBucket = flyout ? groups.find((bucket) => bucket.group === flyout.group) : null;

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={triggerClass}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate">{selected?.label ?? 'Select qualification'}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-content-subtle transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-1 w-1/4 min-w-64 rounded-lg border border-subtle bg-surface p-1.5 shadow-lg">
          <div className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-sunken px-2 py-1.5 dark:bg-surface/3">
            <Search className="h-3.5 w-3.5 shrink-0 text-content-subtle" />
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setFlyout(null);
              }}
              placeholder="Search qualifications..."
              className="w-full bg-transparent text-sm text-content outline-none placeholder:text-content-subtle"
            />
          </div>

          <div className="mt-1.5 max-h-72 overflow-y-auto">
            {groups.length === 0 ? (
              <p className="px-2.5 py-2 text-sm text-content-subtle">No qualifications match &quot;{search}&quot;</p>
            ) : query ? (
              groups.map((bucket) => (
                <div key={bucket.group} className="mb-1 last:mb-0">
                  <p className="px-2.5 py-1 text-xs font-semibold tracking-wide text-content-subtle uppercase">
                    {bucket.label}
                  </p>
                  {bucket.items.map((qual) => (
                    <button
                      key={qual.id}
                      type="button"
                      onClick={() => select(qual.id)}
                      className={optionClass(qual.id === value)}
                    >
                      {qual.label}
                    </button>
                  ))}
                </div>
              ))
            ) : (
              groups.map((bucket) => (
                <div
                  key={bucket.group}
                  onMouseEnter={(event) => openFlyout(bucket.group, event.currentTarget)}
                  onMouseLeave={scheduleFlyoutClose}
                >
                  <button
                    type="button"
                    onClick={(event) =>
                      flyout?.group === bucket.group ? setFlyout(null) : openFlyout(bucket.group, event.currentTarget)
                    }
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition-colors ${
                      flyout?.group === bucket.group
                        ? 'bg-surface-sunken text-content dark:bg-surface/6'
                        : 'text-content hover:bg-surface-sunken dark:hover:bg-surface/6'
                    }`}
                  >
                    {bucket.label}
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-content-subtle" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {flyout &&
        flyoutBucket &&
        createPortal(
          <div
            ref={flyoutRef}
            style={{ top: flyout.top, left: flyout.left, zIndex: 100 }}
            className="fixed max-h-80 w-56 overflow-y-auto rounded-lg border border-subtle bg-surface p-1.5 shadow-lg"
            onMouseEnter={cancelFlyoutClose}
            onMouseLeave={scheduleFlyoutClose}
          >
            {flyoutBucket.items.map((qual) => (
              <button
                key={qual.id}
                type="button"
                onClick={() => select(qual.id)}
                className={optionClass(qual.id === value)}
              >
                {qual.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
