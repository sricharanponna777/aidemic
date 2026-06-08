"use client";

import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { createClient } from "@/lib/supabase-client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Brain,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  Moon,
  Settings,
  Sun,
  Target,
  Zap,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/subjects", label: "Subjects", icon: GraduationCap },
  { href: "/dashboard/notes", label: "Learn", icon: BookOpen },
  { href: "/dashboard/flashcards", label: "Flashcards", icon: Layers },
  { href: "/dashboard/study-sessions", label: "Flashcard Revision", icon: Brain },
  { href: "/dashboard/ai-questions", label: "Smart Practice", icon: Target },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function isActiveRoute(item: (typeof navItems)[number], pathname: string) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { theme, toggleTheme } = useTheme();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

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
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col max-lg:hidden bg-white dark:bg-[#0D1324] border-r border-slate-200 dark:border-white/6 shadow-[2px_0_16px_-4px_rgba(99,102,241,0.08)] dark:shadow-none">

        {/* Brand */}
        <div className="border-b border-slate-200 dark:border-white/6 px-5 py-5">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 group-hover:shadow-indigo-500/50 transition-shadow">
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
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActiveRoute(item, pathname);
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group ${
                  active
                    ? "bg-linear-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-md shadow-indigo-500/20"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/6 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon
                  className={`h-[17px] w-[17px] shrink-0 transition-transform duration-200 group-hover:scale-105 ${
                    active ? "text-white" : "text-slate-500 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-white"
                  }`}
                />
                {item.label}
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/70" />}
              </Link>
            );
          })}
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
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-indigo-500 to-purple-600">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-bold text-slate-900 dark:text-white">AIDemic</span>
        </Link>
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

      {/* Main content */}
      <div className="lg:pl-64">
        <main className="mx-auto max-w-6xl px-4 pt-16 pb-10 sm:px-6 lg:pt-8">
          {children}
        </main>
      </div>

    </div>
  );
}
