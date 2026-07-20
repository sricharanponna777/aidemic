"use client";

import Link from "next/link";
import { BookOpen, Brain, Compass, ListChecks, Target, ChevronRight } from "lucide-react";

export type RevisionCycleStage = "learn" | "recall" | "review" | "practice" | "improve";

const STAGES: { key: RevisionCycleStage; label: string; href: string; icon: typeof BookOpen }[] = [
  { key: "learn", label: "Learn", href: "/dashboard/notes", icon: BookOpen },
  { key: "recall", label: "Recall", href: "/dashboard/study-sessions", icon: Brain },
  { key: "review", label: "Review", href: "/dashboard/daily-review", icon: ListChecks },
  { key: "practice", label: "Practice", href: "/dashboard/ai-questions", icon: Target },
  { key: "improve", label: "Improve", href: "/dashboard/exam-coach", icon: Compass },
];

export function RevisionCycleStepper({ current }: { current?: RevisionCycleStage }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/6 dark:bg-[#131B2E]">
      {STAGES.map((stage, index) => {
        const Icon = stage.icon;
        const active = stage.key === current;
        return (
          <div key={stage.key} className="flex items-center gap-1.5">
            <Link
              href={stage.href}
              className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-semibold transition-colors ${
                active
                  ? "bg-linear-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-sm shadow-indigo-500/20"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/6 dark:hover:text-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {stage.label}
            </Link>
            {index < STAGES.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />
            )}
          </div>
        );
      })}
    </div>
  );
}
