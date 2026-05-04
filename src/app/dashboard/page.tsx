"use client";

import { useAuth } from "@/hooks/useAuth";
import { calculateStudyStreak } from "@/lib/spacedRepetition";
import { createClient } from "@/lib/supabase-client";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  Clock,
  Layers,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { Flashcard, FlashcardDeck, StudySession } from "@/types";

type RecentSession = {
  id: string;
  deckName: string;
  startedAt: string;
  durationMinutes: number;
  cardsStudied: number;
  scorePercentage: number | null;
};

type DashboardMetrics = {
  deckCount: number;
  totalCards: number;
  dueCards: number;
  reviewedCards: number;
  retentionRate: number | null;
  sessionsCompleted: number;
  totalStudyMinutes: number;
  cardsStudied: number;
  averageScore: number | null;
  studyStreak: number;
  recentSessions: RecentSession[];
};

type DashboardDeckRow = Pick<FlashcardDeck, "id" | "card_count">;
type DashboardCardRow = Pick<Flashcard, "deck_id" | "next_review_date" | "times_studied" | "times_correct">;
type DashboardSessionRow = Pick<StudySession, "id" | "started_at" | "duration_minutes" | "cards_studied" | "score_percentage"> & {
  flashcard_decks?: { name?: string } | Array<{ name?: string }> | null;
};

const emptyMetrics: DashboardMetrics = {
  deckCount: 0,
  totalCards: 0,
  dueCards: 0,
  reviewedCards: 0,
  retentionRate: null,
  sessionsCompleted: 0,
  totalStudyMinutes: 0,
  cardsStudied: 0,
  averageScore: null,
  studyStreak: 0,
  recentSessions: [],
};

const getDeckName = (value: unknown) => {
  const relation = value as { flashcard_decks?: { name?: string } | Array<{ name?: string }> };
  if (Array.isArray(relation.flashcard_decks)) {
    return relation.flashcard_decks[0]?.name || "Unknown deck";
  }
  return relation.flashcard_decks?.name || "Unknown deck";
};

const formatMinutes = (minutes: number) => {
  if (minutes <= 0) return "0m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
};

export default function Dashboard() {
  const { session } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!session?.user?.id) return;

      setIsLoading(true);
      setLoadError(null);

      try {
        const supabase = createClient();
        const { data: decks, error: deckError } = await supabase
          .from("flashcard_decks")
          .select("id, name, card_count, updated_at, created_at")
          .eq("user_id", session.user.id)
          .order("updated_at", { ascending: false });

        if (deckError) throw deckError;

        const deckRows = (decks || []) as DashboardDeckRow[];
        const deckIds = deckRows.map((deck) => deck.id);

        const [cardsResponse, sessionsResponse] = await Promise.all([
          deckIds.length > 0
            ? supabase
                .from("flashcards")
                .select("deck_id, next_review_date, times_studied, times_correct")
                .in("deck_id", deckIds)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("study_sessions")
            .select("id, started_at, duration_minutes, cards_studied, score_percentage, flashcard_decks(name)")
            .eq("user_id", session.user.id)
            .order("started_at", { ascending: false }),
        ]);

        if (cardsResponse.error) throw cardsResponse.error;
        if (sessionsResponse.error) throw sessionsResponse.error;

        const now = new Date();
        const cards = (cardsResponse.data || []) as DashboardCardRow[];
        const sessions = ((sessionsResponse.data || []) as DashboardSessionRow[]).map((item) => ({
          id: item.id,
          deckName: getDeckName(item),
          startedAt: item.started_at || "",
          durationMinutes: item.duration_minutes || 0,
          cardsStudied: item.cards_studied || 0,
          scorePercentage:
            typeof item.score_percentage === "number" && Number.isFinite(item.score_percentage)
              ? item.score_percentage
              : null,
        }));

        const totalReviews = cards.reduce((sum, card) => sum + (card.times_studied || 0), 0);
        const totalCorrect = cards.reduce((sum, card) => sum + (card.times_correct || 0), 0);
        const scoreValues = sessions
          .map((item) => item.scorePercentage)
          .filter((score): score is number => typeof score === "number" && Number.isFinite(score));

        setMetrics({
          deckCount: deckRows.length,
          totalCards: cards.length || deckRows.reduce((sum, deck) => sum + (deck.card_count || 0), 0),
          dueCards: cards.filter((card) => {
            if (!card.next_review_date) return true;
            const nextReview = new Date(card.next_review_date);
            return Number.isNaN(nextReview.getTime()) || nextReview <= now;
          }).length,
          reviewedCards: cards.filter((card) => (card.times_studied || 0) > 0).length,
          retentionRate: totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 1000) / 10 : null,
          sessionsCompleted: sessions.length,
          totalStudyMinutes: sessions.reduce((sum, item) => sum + item.durationMinutes, 0),
          cardsStudied: sessions.reduce((sum, item) => sum + item.cardsStudied, 0),
          averageScore:
            scoreValues.length > 0
              ? Math.round(scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length)
              : null,
          studyStreak: calculateStudyStreak(
            sessions
              .map((item) => new Date(item.startedAt).getTime())
              .filter((time) => Number.isFinite(time))
          ),
          recentSessions: sessions.slice(0, 3),
        });
      } catch (err) {
        console.error("Dashboard load failed", err);
        setMetrics(emptyMetrics);
        setLoadError("Unable to load the latest dashboard data.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadDashboard();
  }, [session?.user?.id]);

  const displayName = useMemo(() => {
    return session?.user.email?.split("@")[0] || "there";
  }, [session?.user.email]);

  const statCards = [
    {
      label: "Due cards",
      value: metrics.dueCards.toString(),
      detail: `${metrics.totalCards} total cards`,
      icon: Target,
      tone: "bg-blue-600 text-white",
    },
    {
      label: "Flashcard reviews",
      value: metrics.sessionsCompleted.toString(),
      detail: `${formatMinutes(metrics.totalStudyMinutes)} studied`,
      icon: Brain,
      tone: "bg-teal-600 text-white",
    },
    {
      label: "Cards studied",
      value: metrics.cardsStudied.toString(),
      detail: `${metrics.studyStreak} day streak`,
      icon: Clock,
      tone: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950",
    },
    {
      label: "Retention",
      value: metrics.retentionRate === null ? "--" : `${metrics.retentionRate.toFixed(1)}%`,
      detail: metrics.retentionRate === null ? "Review cards first" : `${metrics.reviewedCards} reviewed cards`,
      icon: BarChart3,
      tone:
        metrics.retentionRate === null
          ? "bg-slate-500 text-white"
          : metrics.retentionRate >= 85
            ? "bg-emerald-600 text-white"
            : metrics.retentionRate >= 70
              ? "bg-amber-500 text-slate-950"
              : "bg-red-600 text-white",
    },
  ];

  const learningFlow = [
    {
      step: "1",
      title: "Notes",
      href: "/dashboard/notes",
      detail: "Study notes, slideshow, and chat.",
      icon: BookOpen,
      tone: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
    },
    {
      step: "2",
      title: "Flashcards",
      href: "/dashboard/flashcards",
      detail: "Turn ideas into recall prompts.",
      icon: Layers,
      tone: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
    },
    {
      step: "3",
      title: "Flashcard reviews",
      href: "/dashboard/study-sessions",
      detail: "Review due cards with intervals.",
      icon: Brain,
      tone: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200",
    },
    {
      step: "4",
      title: "MCQs",
      href: "/dashboard/ai-questions",
      detail: "Test exam-style application.",
      icon: Sparkles,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    },
  ];

  return (
    <div className="space-y-7">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Dashboard</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">Welcome back, {displayName}</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Your next review starts with the cards that are due now.
            </p>
          </div>
          <Link
            href="/dashboard/notes"
            className={buttonStyles({ variant: "primary" })}
          >
            Start with notes
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {loadError ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700/70 dark:bg-red-950/35 dark:text-red-200">
            {loadError}
          </p>
        ) : null}
      </section>

      <section aria-label="Learning overview" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{stat.label}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
                    {isLoading ? "..." : stat.value}
                  </p>
                </div>
                <span className={`rounded-lg p-3 ${stat.tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{isLoading ? "Loading..." : stat.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-blue-100 p-3 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Learning flow</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Learn from notes or a slideshow, convert it into recall, review it, then finish with exam-style MCQs.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {learningFlow.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.step}
                  href={item.href}
                  className={`rounded-lg border p-3 transition hover:-translate-y-0.5 hover:shadow-sm ${item.tone}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">Step {item.step}</span>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs opacity-80">{item.detail}</p>
                </Link>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/notes"
              className={buttonStyles({ variant: "primary" })}
            >
              Begin flow
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {metrics.dueCards > 0 ? `${metrics.dueCards} cards are ready for step 3.` : "Start at step 1 when you want a new topic."}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Recent sessions</h2>
            <CalendarDays className="h-5 w-5 text-slate-400" />
          </div>

          <div className="mt-4 space-y-3">
            {isLoading ? <p className="text-sm text-slate-500 dark:text-slate-400">Loading sessions...</p> : null}
            {!isLoading && metrics.recentSessions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
                No Flashcard reviews yet.
              </p>
            ) : null}
            {metrics.recentSessions.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{item.deckName}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(item.startedAt)} - {formatMinutes(item.durationMinutes)} - {item.cardsStudied} cards
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {item.scorePercentage === null ? "--" : `${item.scorePercentage}%`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Flow shortcuts</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {learningFlow.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.step} href={item.href} className="rounded-lg border border-slate-200 p-5 transition hover:border-blue-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/70">
                <div className="flex items-center justify-between gap-3">
                  <Icon className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {item.step}
                  </span>
                </div>
                <h3 className="mt-3 font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {item.title === "Flashcards" ? `${metrics.deckCount} decks in your library.` : item.detail}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
