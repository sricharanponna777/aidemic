"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { createClient } from "@/lib/supabase-client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  LogOut,
  Menu,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Sun,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { SectionBreadcrumb } from "@/components/SectionBreadcrumb";
import {
  GROUP_ICONS,
  PARENT_NAV_ITEMS,
  STUDENT_NAV_GROUPS,
  TEACHER_NAV_ITEMS,
  isActiveRoute,
  type NavItem,
} from "@/lib/nav";

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
    setPosition({ top: rect.top, left: rect.right + 4 });
  };

  const groupActive = items.some((item) => isActiveRoute(item, pathname));

  return (
    <div
      className="relative mt-2.5"
      onMouseEnter={(e) => open(e.currentTarget)}
      onMouseLeave={scheduleClose}
      onFocus={(e) => open(e.currentTarget)}
      onBlur={scheduleClose}
    >
      <div
        tabIndex={0}
        className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-200 ${
          groupActive
            ? "bg-linear-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-md shadow-indigo-500/20 dark:shadow-indigo-500/40 dark:ring-1 dark:ring-indigo-400/30"
            : "text-content-muted hover:bg-slate-100 dark:hover:bg-surface/6 hover:text-content dark:hover:text-white"
        }`}
      >
        <GroupIcon className={`h-3.5 w-3.5 shrink-0 ${groupActive ? "text-white" : "text-content-subtle dark:text-content-subtle"}`} />
        {label}
        <ChevronRight className={`ml-auto h-3 w-3 shrink-0 ${groupActive ? "text-white/80" : "text-content-subtle"}`} />
      </div>

      {position &&
        createPortal(
          <div
            style={{ top: position.top, left: position.left, zIndex: 100 }}
            className="fixed min-w-40 rounded-lg border border-subtle bg-surface dark:bg-[#0D1324] p-1.5 shadow-lg"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            {items.map((item) => {
              const Icon = item.icon;
              const active = isActiveRoute(item, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-linear-to-r from-indigo-600/90 to-purple-600/90 text-white"
                      : "text-content-muted hover:bg-slate-100 dark:hover:bg-surface/6 hover:text-content dark:hover:text-white"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-white" : "text-content-subtle dark:text-content-subtle"}`} />
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

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { session, profile, isLoading, isProfileLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { theme, toggleTheme } = useTheme();
  const isTeacher = profile?.role === "teacher";
  const isParent = profile?.role === "parent";
  const homeHref = isTeacher ? "/dashboard/teacher" : isParent ? "/dashboard/parent" : "/dashboard";

  const [isSchoolAdmin, setIsSchoolAdmin] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [hasLinkedChild, setHasLinkedChild] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

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
    return () => {
      cancelled = true;
    };
  }, [session, supabase]);

  // Until a child accepts the link the parent pages render nothing, so the
  // per-child nav items would just change the URL and leave the screen as-is.
  const parentNavItems = hasLinkedChild
    ? PARENT_NAV_ITEMS
    : PARENT_NAV_ITEMS.filter((item) => item.href === "/dashboard/parent" || item.href === "/dashboard/settings");

  const baseNavGroups: { label: string | null; items: NavItem[] }[] = isTeacher
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

  const navGroups = isPlatformAdmin
    ? [...baseNavGroups, { label: null, items: [{ href: "/dashboard/admin/schools", label: "Admin", icon: ShieldAlert }] }]
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

  const renderNavLinks = (onNavigate?: () => void, allowFlyouts = true) =>
    navGroups.map((group, groupIndex) => {
      const isCollapsibleGroup = allowFlyouts && group.label !== null;

      if (isCollapsibleGroup) {
        const GroupIcon = GROUP_ICONS[group.label as string] ?? group.items[0].icon;
        return (
          <GroupFlyout
            key={group.label}
            label={group.label as string}
            icon={GroupIcon}
            items={group.items}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        );
      }

      return (
        <div key={group.label ?? `group-${groupIndex}`} className={groupIndex === 0 ? undefined : "mt-2.5"}>
          {!allowFlyouts && group.label && (
            <p className="px-2.5 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-subtle dark:text-content-subtle">
              {group.label}
            </p>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActiveRoute(item, pathname);
              return (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-200 group ${
                    active
                      ? "bg-linear-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-md shadow-indigo-500/20 dark:shadow-indigo-500/40 dark:ring-1 dark:ring-indigo-400/30"
                      : "text-content-muted hover:bg-slate-100 dark:hover:bg-surface/6 hover:text-content dark:hover:text-white"
                  }`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:scale-105 ${
                      active ? "text-white" : "text-content-subtle dark:text-content-subtle group-hover:text-content-muted dark:group-hover:text-white"
                    }`}
                  />
                  {item.label}
                  {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-surface/70" />}
                </Link>
              );
            })}
          </div>
        </div>
      );
    });

  if (isLoading || (session && isProfileLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-indigo-500 animate-bounce" />
          <div className="h-2 w-2 rounded-full bg-purple-500 animate-bounce [animation-delay:0.15s]" />
          <div className="h-2 w-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.3s]" />
        </div>
      </div>
    );
  }

  if (!session) return null;

  const displayName = session.user.email?.split("@")[0] || "?";

  return (
    <div className="min-h-screen bg-canvas">

      {/* Fixed sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col max-lg:hidden bg-surface dark:bg-[#0D1324] border-r border-subtle dark:border-indigo-500/20 shadow-[2px_0_16px_-4px_rgba(99,102,241,0.08)] dark:shadow-[2px_0_28px_-4px_rgba(99,102,241,0.25)]">

        {/* Brand */}
        <div className="border-b border-subtle px-5 py-5">
          <Link href={homeHref} className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 group-hover:shadow-indigo-500/50 transition-shadow dark:animate-glow-pulse">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[17px] font-bold leading-none text-content dark:text-white">AIDemic</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                AI Revision Coach
              </p>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {renderNavLinks()}
        </nav>

        {/* User footer */}
        <div className="border-t border-subtle p-4">
          <div className="mb-3 flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-purple-600 text-xs font-bold uppercase text-white">
              {displayName[0]}
            </div>
            <p className="truncate text-xs text-content-muted">{session.user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleThemeToggle}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-content-subtle hover:bg-slate-100 dark:hover:bg-surface/6 hover:text-content-muted dark:hover:text-white transition-all"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-indigo-500" />}
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-content-subtle hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-all"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-subtle bg-surface/90 dark:bg-[#0D1324]/90 backdrop-blur-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={isMobileNavOpen}
            aria-controls="mobile-nav-drawer"
            className="flex items-center justify-center rounded-lg p-2 text-content-subtle hover:bg-slate-100 dark:hover:bg-surface/6 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href={homeHref} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-indigo-500 to-purple-600">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold text-content dark:text-white">AIDemic</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleThemeToggle}
            className="flex items-center justify-center rounded-lg p-2 text-content-subtle hover:bg-slate-100 dark:hover:bg-surface/6 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-500" />}
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center justify-center rounded-lg p-2 text-content-subtle hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {isMobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsMobileNavOpen(false)}
          />
          <div
            id="mobile-nav-drawer"
            className="animate-slide-in-left absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col bg-surface dark:bg-[#0D1324] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-subtle px-5 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <p className="text-[17px] font-bold leading-none text-content dark:text-white">AIDemic</p>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(false)}
                aria-label="Close menu"
                className="flex items-center justify-center rounded-lg p-2 text-content-subtle hover:bg-slate-100 dark:hover:bg-surface/6 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
              {renderNavLinks(() => setIsMobileNavOpen(false), false)}
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="lg:pl-64">
        <main className="mx-auto max-w-6xl px-4 pt-16 pb-10 sm:px-6 lg:pt-8">
          <div className="animate-page-enter space-y-6">
            {!isTeacher && !isParent && <SectionBreadcrumb />}
            {children}
          </div>
        </main>
      </div>

    </div>
  );
}
