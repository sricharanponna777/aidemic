"use client";

import { useAuth } from "@/hooks/useAuth";
import { BarChart3, BookOpen, Clock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-client";
import { UserStatistics } from "@/types";
import { calculateRetentionRate, getMotivationMessage } from "@/lib/spacedRepetition";

export default function Dashboard() {
  const { session } = useAuth();

  const [stats, setStats] = useState<UserStatistics | null>(null);
  const [deckCount, setDeckCount] = useState(0);
  const [retentionRate, setRetentionRate] = useState(0);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("user_statistics").select("*").limit(1).maybeSingle();
        if (error) {
          console.error("Error fetching dashboard stats:", error.message);
        } else if (data) {
          setStats(data);
        } else {
          console.warn("No dashboard stats row found.");
        }
      } catch (err) {
        console.error("Unexpected stat fetch error", err);
      }
    };
    loadStats();

    const loadDeckCount = async () => {
      try {
        const supabase = createClient();
        const { count, error } = await supabase.from("flashcard_decks").select("*", { count: "exact", head: true });
        if (error) {
          console.error("Error fetching deck count:", error.message);
        } else {
          setDeckCount(count || 0);
        }
      } catch (err) {
        console.error("Unexpected deck count error", err);
      }
    };

    loadDeckCount();

    const loadRetentionRate = async () => {
      try {
        const supabase = createClient();
        const { data: cards, error } = await supabase
          .from("flashcards")
          .select("repetition_count, consecutive_correct");

        if (error) {
          console.error("Error fetching cards for retention:", error.message);
        } else if (cards) {
          const rate = calculateRetentionRate(
            cards.map((card) => ({
              repetition_count: card.repetition_count || 0,
              consecutive_correct: card.consecutive_correct || 0,
            }))
          );
          setRetentionRate(rate);
        }
      } catch (err) {
        console.error("Unexpected retention calculation error", err);
      }
    };

    loadRetentionRate();
  }, []);

  // transform the stats row into an array suitable for the grid
  const statsMapper = (s: UserStatistics) => [
    {
      label: "Study Sessions",
      value: s.total_sessions?.toString() || "0",
      icon: Clock,
      color: "bg-blue-500",
    },
    {
      label: "Flashcard Decks",
      value: deckCount.toString(),
      icon: BookOpen,
      color: "bg-cyan-600",
    },
    {
      label: "Retention Rate",
      value: `${retentionRate.toFixed(1)}%`,
      icon: BarChart3,
      color: retentionRate >= 85 ? "bg-green-500" : retentionRate >= 70 ? "bg-yellow-500" : "bg-red-500",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Welcome back, {session?.user.email?.split("@")[0]}!</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Here&apos;s your learning overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {stats
          ? statsMapper(stats).map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-lg border-l-4 p-6 shadow dark:shadow-lg" style={{ borderLeftColor: stat.color }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{stat.label}</p>
                      <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</p>
                    </div>
                    <div className={`${stat.color} rounded-lg p-4`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </div>
              );
            })
          : null}
      </div>

      {/* Motivation Message */}
      {stats?.current_streak_days && (
        <div className="bg-linear-to-r from-blue-500 to-purple-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">Keep up the great work! 🎉</h3>
              <p className="text-blue-100">
                {getMotivationMessage(stats.current_streak_days, retentionRate)}
              </p>
            </div>
            <div className="text-4xl">📚</div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow dark:shadow-lg">
        <h2 className="mb-6 text-xl font-bold text-gray-900 dark:text-gray-100">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Link href="/dashboard/flashcards" className="rounded-lg border-2 border-blue-200 dark:border-blue-700 p-6 text-center transition hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30">
            <BookOpen className="mx-auto mb-2 h-8 w-8 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Study Flashcards</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Review your flashcard decks</p>
          </Link>
          <Link href="/dashboard/ai-questions" className="rounded-lg border-2 border-emerald-200 dark:border-emerald-700 p-6 text-center transition hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30">
            <Sparkles className="mx-auto mb-2 h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">AI Questions</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Practice interactive exam-board MCQs</p>
          </Link>
          <Link href="/dashboard/study-sessions" className="rounded-lg border-2 border-purple-200 dark:border-purple-700 p-6 text-center transition hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/30">
            <Clock className="mx-auto mb-2 h-8 w-8 text-purple-600 dark:text-purple-400" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Start Study Session</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Begin a focused study session</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
