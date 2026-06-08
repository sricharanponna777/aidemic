"use client";

import { buttonStyles } from "@/components/ui/button";
import { createClient } from "@/lib/supabase-client";
import { ArrowRight, BookOpen, Brain, Layers, Sparkles, Target, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const features = [
  { label: "Specification-aware notes", icon: BookOpen },
  { label: "AI flashcard decks", icon: Layers },
  { label: "Spaced reviews", icon: Brain },
  { label: "Smart practice feedback", icon: Target },
];

export default function Home() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [nextPath, setNextPath] = useState("/dashboard");

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const next = params.get("next") || "/dashboard";
        setNextPath(next.startsWith("/") ? next : "/dashboard");

        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          router.replace("/dashboard");
          return;
        }
      } catch (error) {
        console.error("Unable to check public session:", error);
      } finally {
        setIsChecking(false);
      }
    };

    void checkAuth();
  }, [router]);

  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;
  const signUpHref = `/login?mode=signup&next=${encodeURIComponent("/onboarding")}`;

  if (isChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0A0F1E]">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-500" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-purple-500 [animation-delay:0.15s]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-fuchsia-500 [animation-delay:0.3s]" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#eef2fb] text-slate-950 dark:bg-[#0A0F1E] dark:text-white">
      <section className="relative flex min-h-screen items-center px-4 py-10 sm:px-6">
        <div className="absolute inset-0 bg-linear-to-br from-indigo-500 via-purple-600 to-fuchsia-700 dark:from-indigo-950 dark:via-purple-950 dark:to-fuchsia-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.28),transparent_30%),radial-gradient(circle_at_75%_10%,rgba(255,255,255,0.18),transparent_26%)]" />

        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="max-w-2xl">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white shadow-lg shadow-indigo-950/20 ring-1 ring-white/20">
                <Zap className="h-6 w-6" />
              </span>
              <span>
                <span className="block text-xl font-black text-white">AIDemic</span>
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">AI revision coach</span>
              </span>
            </Link>

            <h1 className="mt-10 max-w-3xl text-5xl font-black leading-tight text-white sm:text-6xl">
              Study from setup to progress in one focused loop.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/82 sm:text-lg">
              AIDemic helps you set your subjects, create notes, build flashcards, review them, and practise exam-style questions while your dashboard tracks progress.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={loginHref} className={buttonStyles({ variant: "primary", size: "lg", className: "bg-white text-slate-950 shadow-xl shadow-indigo-950/30 hover:bg-slate-100" })}>
                Log in
              </Link>
              <Link href={signUpHref} className={buttonStyles({ variant: "secondary", size: "lg", className: "border-white/30 bg-white/12 text-white hover:bg-white/18" })}>
                Sign up
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/18 bg-white/12 p-4 shadow-2xl shadow-indigo-950/25 backdrop-blur-xl">
            <div className="rounded-xl bg-white p-4 text-slate-900 shadow-xl dark:bg-[#131B2E] dark:text-white">
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">Learning flow</p>
                  <p className="mt-1 text-lg font-bold">Today&apos;s revision</p>
                </div>
                <Sparkles className="h-5 w-5 text-purple-500" />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {features.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div key={feature.label} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/6 dark:bg-white/5">
                      <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      <p className="mt-3 text-sm font-semibold">{feature.label}</p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Progress snapshot</p>
                <div className="mt-3 h-2 rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                  <div className="h-full w-3/4 rounded-full bg-emerald-500" />
                </div>
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">Practice attempts, predicted grades, and weak spots stay visible on your dashboard.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
