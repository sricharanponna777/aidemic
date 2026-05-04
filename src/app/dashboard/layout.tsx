"use client";

import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase-client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, LayoutDashboard, Settings, LogOut, Brain, Layers, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { buttonStyles } from "@/components/ui/button";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950">
        <p className="text-gray-600 dark:text-slate-300">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/notes", label: "Notes", icon: BookOpen },
    { href: "/dashboard/flashcards", label: "Flashcards", icon: Layers },
    { href: "/dashboard/study-sessions", label: "Flashcard reviews", icon: Brain },
    { href: "/dashboard/ai-questions", label: "MCQs", icon: Sparkles },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen">
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            <BookOpen className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            AIDemic
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <span className="text-sm text-slate-600 dark:text-slate-300">{session.user.email}</span>
            <button
              onClick={handleSignOut}
              className={buttonStyles({ variant: "danger-ghost", size: "sm" })}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-64 shrink-0 max-lg:hidden">
            <nav className="sticky top-8 space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)) ||
                  (item.href === "/dashboard/notes" && pathname.startsWith("/dashboard/slideshow"));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                      isActive
                        ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20 dark:bg-blue-600 dark:shadow-blue-900/35"
                        : "bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
