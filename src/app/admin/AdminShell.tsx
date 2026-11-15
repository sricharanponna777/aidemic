'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Moon, Sun, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useAdminSchool } from '@/hooks/useSchoolAdmin';
import { createClient } from '@/lib/supabase-client';
import { MonoLabel } from '@/components/ui/telemetry';
import { SCHOOL_ADMIN_NAV_ITEMS, SCHOOL_ADMIN_PREFIX, isActiveRoute } from '@/lib/nav';

/**
 * The admin console's own chrome: a fixed sidebar on desktop, a top bar with a
 * row of tabs on mobile. A school admin has four screens and nothing else, so
 * the dashboard shell's command palette and notification bell would be empty
 * weight.
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
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-content-subtle transition-colors hover:bg-surface-sunken hover:text-content';

  const brand = (
    <Link href={SCHOOL_ADMIN_PREFIX} className="flex shrink-0 items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-accent to-accent-2 text-accent-fg shadow-raised">
        <Zap className="h-5 w-5 fill-white text-white" />
      </span>
      <span className="text-[17px] font-bold leading-none text-content">AIDemic</span>
    </Link>
  );

  const actions = (
    <>
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
    </>
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-subtle bg-surface max-lg:hidden print:hidden">
        <div className="flex h-14 items-center px-5">{brand}</div>

        <div className="px-5 pb-4">
          <MonoLabel>School admin</MonoLabel>
          {school.data && <p className="mt-1 text-sm font-medium leading-snug text-content">{school.data.name}</p>}
        </div>

        <nav aria-label="School admin" className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {SCHOOL_ADMIN_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActiveRoute(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-linear-to-r from-accent to-accent-2 text-accent-fg shadow-raised'
                    : 'text-content-muted hover:bg-surface-sunken hover:text-content'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-accent-fg' : 'text-content-subtle group-hover:text-content-muted'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1 border-t border-subtle p-3">
          <span className="min-w-0 flex-1 truncate px-1 text-xs text-content-subtle">{email}</span>
          {actions}
        </div>
      </aside>

      {/* Top bar + tabs — mobile */}
      <header className="sticky top-0 z-30 border-b border-subtle bg-surface/90 backdrop-blur-xl lg:hidden print:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          {brand}
          <div className="flex items-center gap-1">{actions}</div>
        </div>
        <nav aria-label="School admin" className="scrollbar-none flex gap-1 overflow-x-auto px-4">
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

      <div className="lg:pl-64 print:pl-0">
        <main className="mx-auto max-w-6xl px-4 pt-6 pb-10 sm:px-6 lg:pt-8">
          <div className="animate-page-enter space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
