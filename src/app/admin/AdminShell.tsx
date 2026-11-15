'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Moon, Sun, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useAdminSchool } from '@/hooks/useSchoolAdmin';
import { createClient } from '@/lib/supabase-client';
import { SCHOOL_ADMIN_NAV_ITEMS, SCHOOL_ADMIN_PREFIX, isActiveRoute } from '@/lib/nav';

/**
 * The admin console's own chrome: a top bar and a row of tabs, no sidebar. A
 * school admin has four screens and nothing else, so the dashboard shell's
 * sidebar, command palette and notification bell would all be empty weight.
 */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const school = useAdminSchool();
  const email = session?.user.email ?? '';

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push('/');
  };

  const iconButton =
    'flex h-9 w-9 items-center justify-center rounded-lg text-content-subtle transition-colors hover:bg-surface-sunken hover:text-content';

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-subtle bg-surface/90 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={SCHOOL_ADMIN_PREFIX} className="flex shrink-0 items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-accent to-accent-2 text-accent-fg shadow-raised">
                <Zap className="h-5 w-5 fill-white text-white" />
              </span>
              <span className="text-[17px] font-bold leading-none text-content max-sm:hidden">AIDemic</span>
            </Link>
            <span className="rounded border border-subtle bg-surface-sunken px-1.5 py-px font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-content-muted">
              School admin
            </span>
            {school.data && (
              <span className="min-w-0 truncate text-sm font-medium text-content-muted max-md:hidden">{school.data.name}</span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {email && <span className="mr-2 truncate text-xs text-content-subtle max-md:hidden">{email}</span>}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className={iconButton}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button type="button" onClick={signOut} aria-label="Sign out" className={`${iconButton} hover:bg-danger-muted hover:text-danger`}>
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        <nav aria-label="School admin" className="scrollbar-none mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
          {SCHOOL_ADMIN_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActiveRoute(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'border-accent text-content' : 'border-transparent text-content-muted hover:text-content'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-accent' : 'text-content-subtle'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-10 sm:px-6 lg:pt-8">
        <div className="animate-page-enter space-y-6">{children}</div>
      </main>
    </div>
  );
}
