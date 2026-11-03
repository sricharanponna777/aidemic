"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useUserSubjects } from "@/hooks/useUserSubjects";
import { useGamification, useRefreshOnXp } from "@/hooks/useGamification";
import { createClient } from "@/lib/supabase-client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  LogOut,
  Menu,
  Moon,
  Orbit,
  ShieldAlert,
  ShieldCheck,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";
import { SectionBreadcrumb } from "@/components/SectionBreadcrumb";
import { RankPanel } from "@/components/gamification/RankPanel";
import { LeagueChip } from "@/components/gamification/LeagueChip";
import { XpToast } from "@/components/gamification/XpToast";
import { MonoLabel } from "@/components/ui/telemetry";
import { levelForXp } from "@/lib/gamification/levels";
import {
  GROUP_ICONS,
  PARENT_NAV_ITEMS,
  STUDENT_NAV_GROUPS,
  TEACHER_NAV_ITEMS,
  isActiveRoute,
  type NavGroup,
  type NavItem,
} from "@/lib/nav";

const itemClass = (active: boolean) =>
  `group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
    active ? "bg-accent text-accent-fg shadow-card" : "text-content-muted hover:bg-surface-sunken hover:text-content"
  }`;

const iconClass = (active: boolean) =>
  `h-4 w-4 shrink-0 ${active ? "text-accent-fg" : "text-content-subtle group-hover:text-content-muted"}`;

/** Small mono count on the right of a nav item ("6 active", "Lvl 12"). */
function NavCount({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`ml-auto rounded px-1.5 py-px font-mono text-[10px] font-medium ${
        active ? "bg-accent-fg/15 text-accent-fg" : "border border-xp/25 bg-xp-muted text-xp"
      }`}
    >
      {children}
    </span>
  );
}

function GroupFlyout({
  label,
  icon: GroupIcon,
  items,
  pathname,
  onNavigate,
}: {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPosition(null), 150);
  };

  const open = (target: HTMLElement) => {
    cancelClose();
    const rect = target.getBoundingClientRect();
    setPosition({ top: rect.top, left: rect.right + 6 });
  };

  const groupActive = items.some((item) => isActiveRoute(item, pathname));

  return (
    <div
      className="relative"
      onMouseEnter={(e) => open(e.currentTarget)}
      onMouseLeave={scheduleClose}
      onFocus={(e) => open(e.currentTarget)}
      onBlur={scheduleClose}
    >
      <div tabIndex={0} className={`${itemClass(groupActive)} cursor-default`}>
        <GroupIcon className={iconClass(groupActive)} />
        {label}
        <ChevronRight className={`ml-auto h-3 w-3 shrink-0 ${groupActive ? "text-accent-fg/70" : "text-content-subtle"}`} />
      </div>

      {position &&
        createPortal(
          <div
            style={{ top: position.top, left: position.left, zIndex: 100 }}
            className="fixed min-w-44 rounded-lg border border-subtle bg-surface-raised p-1.5 shadow-overlay"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <MonoLabel className="px-2.5 pb-1 pt-0.5">{label}</MonoLabel>
            {items.map((item) => {
              const Icon = item.icon;
              const active = isActiveRoute(item, pathname);
              return (
                <Link key={item.href} href={item.href} onClick={onNavigate} className={itemClass(active)}>
                  <Icon className={iconClass(active)} />
                  {item.label}
                </Link>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Consecutive groups sharing a `section` are drawn under one heading. */
const bySection = (groups: NavGroup[]) => {
  const sections: { section: string; groups: NavGroup[] }[] = [];
  for (const group of groups) {
    const section = group.section ?? "Workspace";
    const last = sections[sections.length - 1];
    if (last && last.section === section) last.groups.push(group);
    else sections.push({ section, groups: [group] });
  }
  return sections;
};

function AccountMenu({
  email,
  theme,
  onToggleTheme,
  onSignOut,
}: {
  email: string;
  theme: string;
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-bold uppercase text-accent-fg transition-opacity hover:opacity-85"
      >
        {email[0] ?? "?"}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-lg border border-subtle bg-surface-raised p-1.5 shadow-overlay"
        >
          <p className="truncate px-2.5 py-2 text-xs text-content-subtle">{email}</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onToggleTheme();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-content-muted hover:bg-surface-sunken hover:text-content"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onSignOut}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-danger hover:bg-danger-muted"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { session, profile, isLoading, isProfileLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { theme, toggleTheme } = useTheme();
  const isTeacher = profile?.role === "teacher";
  const isParent = profile?.role === "parent";
  const isStudent = profile?.role === "student";
  const homeHref = isTeacher ? "/dashboard/teacher" : isParent ? "/dashboard/parent" : "/dashboard";

  const [isSchoolAdmin, setIsSchoolAdmin] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [hasLinkedChild, setHasLinkedChild] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const { subjects } = useUserSubjects({ enabled: isStudent });
  const { data: gamification } = useGamification();
  useRefreshOnXp();

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const load = async () => {
      const [{ data: teacherRow }, { data: adminRow }, { count: linkedChildren }] = await Promise.all([
        supabase.from("teachers").select("is_school_admin").eq("user_id", session.user.id).maybeSingle(),
        supabase.from("platform_admins").select("user_id").eq("user_id", session.user.id).maybeSingle(),
        supabase
          .from("parent_links")
          .select("id", { count: "exact", head: true })
          .eq("parent_id", session.user.id)
          .eq("status", "active"),
      ]);
      if (cancelled) return;
      setIsSchoolAdmin(!!teacherRow?.is_school_admin);
      setIsPlatformAdmin(!!adminRow);
      setHasLinkedChild((linkedChildren ?? 0) > 0);
    };
    void load();

    // A child accepting a link in their own browser grows this parent's nav
    // from two items to the full set. Without this the sidebar stays truncated
    // even after the parent dashboard itself has populated.
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [session, supabase]);

  // Until a child accepts the link the parent pages render nothing, so the
  // per-child nav items would just change the URL and leave the screen as-is.
  const parentNavItems = hasLinkedChild
    ? PARENT_NAV_ITEMS
    : PARENT_NAV_ITEMS.filter((item) => item.href === "/dashboard/parent" || item.href === "/dashboard/settings");

  const baseNavGroups: NavGroup[] = isTeacher
    ? [
        {
          label: null,
          items: [
            ...TEACHER_NAV_ITEMS,
            ...(isSchoolAdmin ? [{ href: "/dashboard/teacher/school", label: "School", icon: ShieldCheck }] : []),
          ],
        },
      ]
    : isParent
    ? [{ label: null, items: parentNavItems }]
    : STUDENT_NAV_GROUPS;

  const navGroups: NavGroup[] = isPlatformAdmin
    ? [
        ...baseNavGroups,
        { label: null, section: "Admin", items: [{ href: "/dashboard/admin/verification", label: "Admin", icon: ShieldAlert }] },
      ]
    : baseNavGroups;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  // Settings saves the choice to user_profiles.theme; persisting here too
  // keeps the stored preference in step with the toggle, so a new device
  // starts on the theme the user actually last picked.
  const handleThemeToggle = async () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    toggleTheme();
    if (!session) return;
    const { error } = await supabase
      .from("user_profiles")
      .update({ theme: nextTheme })
      .eq("id", session.user.id);
    if (error) console.error("Failed to save theme preference:", error.message);
  };

  const countFor = (href: string): string | null => {
    if (!isStudent) return null;
    if (href === "/dashboard/subjects" && subjects.length > 0) return `${subjects.length} active`;
    if (href === "/dashboard/progress" && gamification) return `Lvl ${levelForXp(gamification.totalXp)}`;
    return null;
  };

  const renderItem = (item: NavItem, onNavigate?: () => void) => {
    const Icon = item.icon;
    const active = isActiveRoute(item, pathname);
    const count = countFor(item.href);
    return (
      <Link key={item.href + item.label} href={item.href} onClick={onNavigate} className={itemClass(active)}>
        <Icon className={iconClass(active)} />
        {item.label}
        {count && <NavCount active={active}>{count}</NavCount>}
      </Link>
    );
  };

  const renderNavLinks = (onNavigate?: () => void, allowFlyouts = true) =>
    bySection(navGroups).map(({ section, groups }) => (
      <div key={section} className="mb-4 last:mb-0">
        <MonoLabel className="px-2.5 pb-1.5">{section}</MonoLabel>
        <div className="space-y-0.5">
          {groups.map((group, groupIndex) => {
            if (allowFlyouts && group.label !== null) {
              const GroupIcon = GROUP_ICONS[group.label] ?? group.items[0].icon;
              return (
                <GroupFlyout
                  key={group.label}
                  label={group.label}
                  icon={GroupIcon}
                  items={group.items}
                  pathname={pathname}
                  onNavigate={onNavigate}
                />
              );
            }
            return (
              <div key={group.label ?? `group-${groupIndex}`} className={group.label ? "pt-1.5" : undefined}>
                {group.label && <p className="px-2.5 pb-0.5 text-[11px] font-semibold text-content-subtle">{group.label}</p>}
                <div className="space-y-0.5">{group.items.map((item) => renderItem(item, onNavigate))}</div>
              </div>
            );
          })}
        </div>
      </div>
    ));

  if (isLoading || (session && isProfileLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-content animate-bounce" />
          <div className="h-2 w-2 rounded-full bg-content-subtle animate-bounce [animation-delay:0.15s]" />
          <div className="h-2 w-2 rounded-full bg-content animate-bounce [animation-delay:0.3s]" />
        </div>
      </div>
    );
  }

  if (!session) return null;

  const email = session.user.email ?? "";

  const brand = (
    <Link href={homeHref} className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
        <Orbit className="h-4.5 w-4.5" />
      </span>
      <span className="text-[17px] font-bold leading-none text-content">AIDemic</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-canvas">

      {/* Fixed sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-subtle bg-surface max-lg:hidden print:hidden">
        <div className="flex h-14 items-center px-5">{brand}</div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">{renderNavLinks()}</nav>

        {isStudent && (
          <div className="p-3">
            <RankPanel />
          </div>
        )}
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-subtle bg-surface/90 px-4 backdrop-blur-xl lg:hidden print:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={isMobileNavOpen}
            aria-controls="mobile-nav-drawer"
            className="flex items-center justify-center rounded-lg p-2 text-content-subtle transition-colors hover:bg-surface-sunken"
          >
            <Menu className="h-5 w-5" />
          </button>
          {brand}
        </div>
        <AccountMenu email={email} theme={theme} onToggleTheme={handleThemeToggle} onSignOut={handleSignOut} />
      </div>

      {/* Mobile nav drawer */}
      {isMobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsMobileNavOpen(false)}
          />
          <div
            id="mobile-nav-drawer"
            className="animate-slide-in-left absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col bg-surface shadow-overlay"
          >
            <div className="flex h-14 items-center justify-between border-b border-subtle px-5">
              {brand}
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(false)}
                aria-label="Close menu"
                className="flex items-center justify-center rounded-lg p-2 text-content-subtle transition-colors hover:bg-surface-sunken"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4">{renderNavLinks(() => setIsMobileNavOpen(false), false)}</nav>
            {isStudent && (
              <div className="p-3">
                <RankPanel onNavigate={() => setIsMobileNavOpen(false)} />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="lg:pl-64 print:pl-0">
        {/* Desktop top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-subtle bg-canvas/85 px-6 backdrop-blur-xl max-lg:hidden print:hidden">
          <div className="flex min-w-0 items-center gap-4">
            <SectionBreadcrumb groups={navGroups} />
            {isStudent && <LeagueChip />}
          </div>
          <AccountMenu email={email} theme={theme} onToggleTheme={handleThemeToggle} onSignOut={handleSignOut} />
        </header>

        <main className="mx-auto max-w-6xl px-4 pt-16 pb-10 sm:px-6 lg:pt-8 print:mx-0 print:max-w-none print:p-0">
          <div className="animate-page-enter space-y-6">{children}</div>
        </main>
      </div>

      {isStudent && <XpToast />}
    </div>
  );
}
