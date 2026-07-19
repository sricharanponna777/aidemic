"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { createClient } from "@/lib/supabase-client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  Brain,
  ClipboardList,
  GraduationCap,
  Headphones,
  Heart,
  Compass,
  Layers,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Users,
  X,
  Zap,
} from "lucide-react";

const STUDENT_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/subjects", label: "Subjects", icon: GraduationCap },
  { href: "/dashboard/notes", label: "Learn", icon: BookOpen },
  { href: "/dashboard/podcasts", label: "Podcasts", icon: Headphones },
  { href: "/dashboard/flashcards", label: "Flashcards", icon: Layers },
  { href: "/dashboard/study-sessions", label: "Flashcard Revision", icon: Brain },
  { href: "/dashboard/ai-questions", label: "Smart Practice", icon: Target },
  { href: "/dashboard/daily-review", label: "Daily Review", icon: ListChecks },
  { href: "/dashboard/exam-coach", label: "Exam Coach", icon: Compass },
  { href: "/dashboard/classes", label: "My Classes", icon: Users },
  { href: "/dashboard/family", label: "Family", icon: Heart },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const TEACHER_NAV_ITEMS = [
  { href: "/dashboard/teacher", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/teacher/classes", label: "Classes", icon: Users },
  { href: "/dashboard/teacher/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/dashboard/teacher/reports", label: "Reports", icon: BarChart3 },
  { href: "/dashboard/teacher/ai-insights", label: "AI Insights", icon: Sparkles },
  { href: "/dashboard/teacher/question-bank", label: "Question Bank", icon: Layers },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const PARENT_NAV_ITEMS = [
  { href: "/dashboard/parent", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function isActiveRoute(item: { href: string; exact?: boolean }, pathname: string) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, profile, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { theme, toggleTheme } = useTheme();
  const isTeacher = profile?.role === "teacher";
  const isParent = profile?.role === "parent";
  const homeHref = isTeacher ? "/dashboard/teacher" : isParent ? "/dashboard/parent" : "/dashboard";

  const [isSchoolAdmin, setIsSchoolAdmin] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const load = async () => {
      const [{ data: teacherRow }, { data: adminRow }] = await Promise.all([
        supabase.from("teachers").select("is_school_admin").eq("user_id", session.user.id).maybeSingle(),
        supabase.from("platform_admins").select("user_id").eq("user_id", session.user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setIsSchoolAdmin(!!teacherRow?.is_school_admin);
      setIsPlatformAdmin(!!adminRow);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session, supabase]);

  const navItems = [
    ...(isTeacher ? TEACHER_NAV_ITEMS : isParent ? PARENT_NAV_ITEMS : STUDENT_NAV_ITEMS),
    ...(isTeacher && isSchoolAdmin ? [{ href: "/dashboard/teacher/school", label: "School", icon: ShieldCheck }] : []),
    ...(isPlatformAdmin ? [{ href: "/dashboard/admin/schools", label: "Admin", icon: ShieldAlert }] : []),
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const renderNavLinks = (onNavigate?: () => void) =>
    navItems.map((item) => {
      const Icon = item.icon;
      const active = isActiveRoute(item, pathname);
      return (
        <Link
          key={item.href + item.label}
          href={item.href}
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group ${
            active
              ? "bg-linear-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-md shadow-indigo-500/20 dark:shadow-indigo-500/40 dark:ring-1 dark:ring-indigo-400/30"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/6 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Icon
            className={`h-4.25 w-4.25 shrink-0 transition-transform duration-200 group-hover:scale-105 ${
              active ? "text-white" : "text-slate-500 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-white"
            }`}
          />
          {item.label}
          {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/70" />}
        </Link>
      );
    });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0F1E]">
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
    <div className="min-h-screen bg-[#eef2fb] dark:bg-[#0A0F1E]">

      {/* Fixed sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col max-lg:hidden bg-white dark:bg-[#0D1324] border-r border-slate-200 dark:border-indigo-500/20 shadow-[2px_0_16px_-4px_rgba(99,102,241,0.08)] dark:shadow-[2px_0_28px_-4px_rgba(99,102,241,0.25)]">

        {/* Brand */}
        <div className="border-b border-slate-200 dark:border-white/6 px-5 py-5">
          <Link href={homeHref} className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 group-hover:shadow-indigo-500/50 transition-shadow dark:animate-glow-pulse">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[17px] font-bold leading-none text-slate-900 dark:text-white">AIDemic</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-400">
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
        <div className="border-t border-slate-200 dark:border-white/6 p-4">
          <div className="mb-3 flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-purple-600 text-xs font-bold uppercase text-white">
              {displayName[0]}
            </div>
            <p className="truncate text-xs text-slate-600 dark:text-slate-400">{session.user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/6 hover:text-slate-700 dark:hover:text-white transition-all"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-indigo-500" />}
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-all"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-slate-200 dark:border-white/6 bg-white/90 dark:bg-[#0D1324]/90 backdrop-blur-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={isMobileNavOpen}
            aria-controls="mobile-nav-drawer"
            className="flex items-center justify-center rounded-lg p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/6 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href={homeHref} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-indigo-500 to-purple-600">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold text-slate-900 dark:text-white">AIDemic</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center justify-center rounded-lg p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/6 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-500" />}
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center justify-center rounded-lg p-2 text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 transition-colors"
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
            className="animate-slide-in-left absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col bg-white dark:bg-[#0D1324] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/6 px-5 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <p className="text-[17px] font-bold leading-none text-slate-900 dark:text-white">AIDemic</p>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(false)}
                aria-label="Close menu"
                className="flex items-center justify-center rounded-lg p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/6 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
              {renderNavLinks(() => setIsMobileNavOpen(false))}
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="lg:pl-64">
        <main className="mx-auto max-w-6xl px-4 pt-16 pb-10 sm:px-6 lg:pt-8">
          <div className="animate-page-enter">
            {children}
          </div>
        </main>
      </div>

    </div>
  );
}
