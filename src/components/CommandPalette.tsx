'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, Search } from 'lucide-react';
import type { NavGroup, NavItem } from '@/lib/nav';
import { MonoLabel } from '@/components/ui/telemetry';

type Entry = NavItem & { where: string };

const OPEN_SEARCH_EVENT = 'aidemic:open-search';

/** A top-bar button that opens the palette. The shell has two top bars (one
 *  per breakpoint, the other hidden by CSS), so the palette itself is mounted
 *  once and the buttons only ask it to open -- two palettes would both catch
 *  Ctrl+K and cancel each other out. */
export function SearchButton() {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
      className="flex h-9 items-center gap-2 rounded-lg border border-subtle bg-surface px-2.5 text-sm text-content-subtle transition-colors hover:border-strong hover:text-content max-sm:w-9 max-sm:justify-center max-sm:px-0"
      aria-label="Search pages"
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="max-sm:hidden">Search pages…</span>
      <kbd className="ml-4 rounded border border-subtle bg-surface-sunken px-1.5 py-px font-mono text-[11px] max-sm:hidden">
        {isMac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}

const flatten = (groups: NavGroup[]): Entry[] => {
  const seen = new Set<string>();
  return groups.flatMap((group) =>
    group.items.flatMap((item) => {
      if (seen.has(item.href)) return [];
      seen.add(item.href);
      return [{ ...item, where: group.label ?? group.section ?? 'Workspace' }];
    })
  );
};

/** Label matches first, then section matches ("review" finds everything under Review). */
export const searchEntries = (entries: Entry[], query: string): Entry[] => {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  const byLabel = entries.filter((e) => e.label.toLowerCase().includes(q));
  const bySection = entries.filter((e) => !byLabel.includes(e) && e.where.toLowerCase().includes(q));
  return [...byLabel, ...bySection];
};

/**
 * Jump to any page in this user's nav: Ctrl/Cmd+K anywhere, or a
 * SearchButton. Mount exactly once. Searches only the pages the sidebar already offers this role, so it
 * can never surface a route the user would be bounced from.
 */
export function CommandPalette({ groups }: { groups: NavGroup[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo(() => flatten(groups), [groups]);
  const results = useMemo(() => searchEntries(entries, query), [entries, query]);

  useEffect(() => {
    const onOpen = () => {
      setQuery('');
      setActive(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setQuery('');
        setActive(0);
        setOpen((wasOpen) => !wasOpen);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    setOpen(false);
    router.push(entry.href);
  };

  return (
    <>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[110] flex items-start justify-center bg-black/50 px-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Search pages"
              onMouseDown={(e) => e.stopPropagation()}
              className="animate-page-enter w-full max-w-lg overflow-hidden rounded-xl border border-subtle bg-surface-raised shadow-overlay"
            >
              <div className="flex items-center gap-2.5 border-b border-subtle px-4">
                <Search className="h-4 w-4 shrink-0 text-content-subtle" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setActive((i) => Math.min(i + 1, results.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActive((i) => Math.max(i - 1, 0));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      go(results[active]);
                    } else if (e.key === 'Escape') {
                      setOpen(false);
                    }
                  }}
                  placeholder="Where do you want to go?"
                  aria-label="Search pages"
                  aria-controls="command-results"
                  aria-activedescendant={results[active] ? `command-${active}` : undefined}
                  className="h-12 flex-1 bg-transparent text-sm text-content outline-none placeholder:text-content-subtle"
                />
              </div>
              <ul id="command-results" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
                {results.length === 0 ? (
                  <li className="px-3 py-6 text-center text-body text-content-subtle">No page called that.</li>
                ) : (
                  results.map((entry, i) => {
                    const Icon = entry.icon;
                    const selected = i === active;
                    return (
                      <li
                        key={entry.href}
                        id={`command-${i}`}
                        role="option"
                        aria-selected={selected}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(entry)}
                        className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm ${
                          selected ? 'bg-accent text-accent-fg' : 'text-content-muted'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 font-medium">{entry.label}</span>
                        <span className={`font-mono text-[11px] uppercase tracking-wider ${selected ? 'text-accent-fg/70' : 'text-content-subtle'}`}>
                          {entry.where}
                        </span>
                        {selected && <CornerDownLeft className="h-3.5 w-3.5" aria-hidden="true" />}
                      </li>
                    );
                  })
                )}
              </ul>
              <div className="border-t border-subtle px-4 py-2">
                <MonoLabel>↑ ↓ to move · Enter to open · Esc to close</MonoLabel>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
