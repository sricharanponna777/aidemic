"use client";

import { useAuth } from "@/hooks/useAuth";
import { calculateGoalProgress, calculateRetentionRate, calculateStudyStreak, getMotivationMessage } from "@/lib/spacedRepetition";
import { createClient } from "@/lib/supabase-client";
import {
  ArrowRight,
  Brain,
  GraduationCap,
  Sparkles,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { useToast } from "@/components/ToastProvider";
import { Flashcard, FlashcardDeck, StudySession } from "@/types";
import { weightedPredictedGrade } from "@/lib/ai/gradeAverages";
import { getExamBoardLabel, getExamTypeLabel, getSubjectLabel } from "@/lib/ai/subjectConfig";
import { gcseTierLabelForGrade, gradeBadgeTone } from "@/lib/gradeTone";
import { mapStudentSubjectRow, STUDENT_SUBJECT_SELECT, type StudentSubjectRow } from "@/lib/ai/studentSubjects";
import { RevisionCycleStepper } from "@/components/RevisionCycleStepper";

type RecentSession = {
  id: string;
  deckName: string;
  startedAt: string;
  durationMinutes: number;
  cardsStudied: number;
};

type RecentPracticeAttempt = {
  id: string;
  topic: string;
  subject: string;
  examType: "gcse" | "a-level" | null;
  specTier: string | null;
  percentage: number | null;
  predictedGrade: string | null;
  totalMarksAwarded: number | null;
  totalAvailableMarks: number | null;
  createdAt: string;
  attemptMode: string | null;
};

type WeaknessEntry = {
  tag: string;
  count: number;
  subjects: string[];
};

type SubjectPredictedGrade = {
  subject: string;
  examBoard: string | null;
  examType: "gcse" | "a-level" | null;
  specTier: string | null;
  predictedGrade: string;
  totalMarksAwarded: number | null;
  totalAvailableMarks: number | null;
  totalPercentage: number | null;
  attempts: number;
  analysableAttempts: number;
};

type DashboardMetrics = {
  deckCount: number;
  totalCards: number;
  dueCards: number;
  reviewedCards: number;
  sessionsCompleted: number;
  totalStudyMinutes: number;
  cardsStudied: number;
  studyStreak: number;
  recentSessions: RecentSession[];
  recentPracticeAttempts: RecentPracticeAttempt[];
  topWeaknesses: WeaknessEntry[];
  examAttemptsCount: number;
  primaryExamType: "gcse" | "a-level" | null;
  latestPracticePercentage: number | null;
  latestPracticeGrade: string | null;
  subjectPredictedGrades: SubjectPredictedGrade[];
  retentionRate: number;
  cardsStudiedToday: number;
  goalProgress: { percentage: number; message: string; achieved: boolean };
  motivationMessage: string;
};

type DashboardAttemptRow = {
  id: string;
  subject: string;
  topic?: string | null;
  weakness_tags?: string[] | null;
  weakness_analysis?: string[] | null;
  exam_board?: string | null;
  exam_type?: string | null;
  percentage?: number | null;
  predicted_grade?: string | null;
  total_marks_awarded?: number | null;
  total_available_marks?: number | null;
  created_at?: string | null;
  attempt_mode?: string | null;
};

type DashboardSubjectRow = {
  id: string;
  subject: string;
  exam_board?: string | null;
  exam_type?: string | null;
  spec_tier?: string | null;
};

type DashboardDeckRow = Pick<FlashcardDeck, "id" | "card_count">;
type DashboardCardRow = Pick<Flashcard, "deck_id" | "next_review_date" | "times_studied" | "repetition_count" | "consecutive_correct">;
type DashboardSessionRow = Pick<StudySession, "id" | "started_at" | "duration_minutes" | "cards_studied"> & {
  flashcard_decks?: { name?: string } | Array<{ name?: string }> | null;
};

const DEFAULT_DAILY_GOAL = 20;

const emptyMetrics: DashboardMetrics = {
  deckCount: 0, totalCards: 0, dueCards: 0, reviewedCards: 0,
  sessionsCompleted: 0, totalStudyMinutes: 0,
  cardsStudied: 0, studyStreak: 0,
  recentSessions: [], recentPracticeAttempts: [], topWeaknesses: [], examAttemptsCount: 0,
  primaryExamType: null, latestPracticePercentage: null, latestPracticeGrade: null,
  subjectPredictedGrades: [],
  retentionRate: 0, cardsStudiedToday: 0,
  goalProgress: { percentage: 0, message: "", achieved: false },
  motivationMessage: "",
};

const getDeckName = (value: unknown) => {
  const relation = value as { flashcard_decks?: { name?: string } | Array<{ name?: string }> };
  if (Array.isArray(relation.flashcard_decks)) return relation.flashcard_decks[0]?.name || "Unknown deck";
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

const formatQualificationLabel = ({
  examBoard,
  examType,
  specTier,
  grade,
  fallback = "Qualification pending",
}: {
  examBoard?: string | null;
  examType?: "gcse" | "a-level" | null;
  specTier?: string | null;
  grade?: string | null;
  fallback?: string;
}) => {
  if (!examType) return fallback;
  const tierLabel = gcseTierLabelForGrade({ grade, examType, specTier });
  const parts = [
    examBoard ? getExamBoardLabel(examBoard) : "",
    getExamTypeLabel(examType),
    tierLabel ?? "",
  ].filter(Boolean);
  return parts.join(" ");
};

const formatTotalScoreLabel = (item: {
  totalMarksAwarded: number | null;
  totalAvailableMarks: number | null;
  totalPercentage: number | null;
  analysableAttempts: number;
  attempts: number;
}) => {
  if (item.totalMarksAwarded === null || item.totalAvailableMarks === null) {
    return `${item.analysableAttempts}/${item.attempts} attempts`;
  }
  return `${item.totalMarksAwarded}/${item.totalAvailableMarks}${item.totalPercentage === null ? '' : ` (${item.totalPercentage}%)`}`;
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const normalizeInsightLabel = (value: string) =>
  value
    .replace(/^Main pattern to fix:\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim()
    .slice(0, 70);

export default function Dashboard() {
  const { session, profile, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [subjectLookup, setSubjectLookup] = useState<DashboardSubjectRow[]>([]);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isTeacher = profile?.role === "teacher";
  const isParent = profile?.role === "parent";

  useEffect(() => {
    if (isTeacher) router.replace("/dashboard/teacher");
    else if (isParent) router.replace("/dashboard/parent");
  }, [isTeacher, isParent, router]);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!session?.user?.id || isTeacher || isParent) return;
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

        const [cardsResponse, sessionsResponse, attemptsResponse, subjectsResponse] = await Promise.all([
          deckIds.length > 0
            ? supabase
                .from("flashcards")
                .select("deck_id, next_review_date, times_studied, repetition_count, consecutive_correct")
                .in("deck_id", deckIds)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("study_sessions")
            .select("id, started_at, duration_minutes, cards_studied, flashcard_decks(name)")
            .eq("user_id", session.user.id)
            .order("started_at", { ascending: false }),
          supabase
            .from("exam_practice_attempts")
            .select("id, subject, topic, weakness_tags, weakness_analysis, exam_board, exam_type, percentage, predicted_grade, total_marks_awarded, total_available_marks, created_at, attempt_mode")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false })
            .limit(50),
          supabase
            .from("student_subjects")
            .select(STUDENT_SUBJECT_SELECT)
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: true }),
        ]);

        if (cardsResponse.error) throw cardsResponse.error;
        if (sessionsResponse.error) throw sessionsResponse.error;
        if (attemptsResponse.error) {
          console.error("Practice history load failed", attemptsResponse.error);
          setLoadError("AI Insights could not load practice history. Check that exam_practice_attempts exists in Supabase.");
        }
        if (subjectsResponse.error) {
          console.error("Subject report card load failed", subjectsResponse.error);
        }

        const attempts = (attemptsResponse.data ?? []) as DashboardAttemptRow[];
        const savedSubjects = ((subjectsResponse.data ?? []) as unknown as StudentSubjectRow[]).map(
          mapStudentSubjectRow
        ) as DashboardSubjectRow[];
        const latestAttempt = attempts[0];
        const primaryExamType = (attempts[0]?.exam_type === "a-level" ? "a-level" : attempts.length > 0 ? "gcse" : null) as "gcse" | "a-level" | null;
        const tagMap = new Map<string, { count: number; subjects: Set<string> }>();
        for (const attempt of attempts) {
          const rawInsights = (attempt.weakness_tags?.length ? attempt.weakness_tags : attempt.weakness_analysis) ?? [];
          for (const tag of rawInsights) {
            const norm = normalizeInsightLabel(tag);
            if (!norm) continue;
            const entry = tagMap.get(norm) ?? { count: 0, subjects: new Set() };
            entry.count += 1;
            entry.subjects.add(attempt.subject);
            tagMap.set(norm, entry);
          }
        }
        const topWeaknesses: WeaknessEntry[] = [...tagMap.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 6)
          .map(([tag, { count, subjects }]) => ({ tag, count, subjects: [...subjects] }));
        const recentPracticeAttempts: RecentPracticeAttempt[] = attempts.slice(0, 5).map((attempt) => ({
          id: attempt.id,
          topic: attempt.topic || "Practice attempt",
          subject: attempt.subject,
          examType: attempt.exam_type === "a-level" ? "a-level" : attempt.exam_type === "gcse" ? "gcse" : null,
          specTier: (
            savedSubjects.find((subject) =>
              subject.subject === attempt.subject &&
              subject.exam_type === attempt.exam_type &&
              (!attempt.exam_board || subject.exam_board === attempt.exam_board)
            ) ??
            savedSubjects.find((subject) => subject.subject === attempt.subject && subject.exam_type === attempt.exam_type)
          )?.spec_tier ?? null,
          percentage:
            typeof attempt.percentage === "number" && Number.isFinite(attempt.percentage)
              ? attempt.percentage
              : null,
          predictedGrade: attempt.predicted_grade || null,
          totalMarksAwarded:
            typeof attempt.total_marks_awarded === "number" && Number.isFinite(attempt.total_marks_awarded)
              ? attempt.total_marks_awarded
              : null,
          totalAvailableMarks:
            typeof attempt.total_available_marks === "number" && Number.isFinite(attempt.total_available_marks)
              ? attempt.total_available_marks
              : null,
          createdAt: attempt.created_at || "",
          attemptMode: attempt.attempt_mode ?? null,
        }));
        const subjectGroups = new Map<string, DashboardAttemptRow[]>();
        for (const attempt of attempts) {
          const examType = attempt.exam_type === "a-level" ? "a-level" : attempt.exam_type === "gcse" ? "gcse" : null;
          const key = `${attempt.subject}|${examType ?? "unknown"}`;
          subjectGroups.set(key, [...(subjectGroups.get(key) ?? []), attempt]);
        }
        const subjectReportKeys = new Map<string, DashboardSubjectRow>();
        for (const group of subjectGroups.values()) {
          const first = group[0];
          const examType = first.exam_type === "a-level" ? "a-level" : first.exam_type === "gcse" ? "gcse" : null;
          const key = `${first.subject}|${examType ?? "unknown"}`;
          const savedSubject = (
            savedSubjects.find((subject) =>
              subject.subject === first.subject &&
              subject.exam_type === examType &&
              (!first.exam_board || subject.exam_board === first.exam_board)
            ) ??
            savedSubjects.find((subject) => subject.subject === first.subject && subject.exam_type === examType)
          );
          subjectReportKeys.set(key, {
            id: savedSubject?.id ?? key,
            subject: first.subject,
            exam_board: savedSubject?.exam_board ?? null,
            exam_type: examType,
            spec_tier: savedSubject?.spec_tier ?? null,
          });
        }
        const subjectPredictedGrades: SubjectPredictedGrade[] = [...subjectReportKeys.values()]
          .map((subject) => {
            const examType = (subject.exam_type === "a-level" ? "a-level" : subject.exam_type === "gcse" ? "gcse" : null) as "gcse" | "a-level" | null;
            const group = subjectGroups.get(`${subject.subject}|${examType ?? "unknown"}`) ?? [];
            const prediction = weightedPredictedGrade(group, examType, subject.spec_tier, subject.exam_board);
            return {
              subject: subject.subject,
              examBoard: subject.exam_board ?? null,
              examType,
              specTier: subject.spec_tier ?? null,
              predictedGrade: prediction.grade,
              totalMarksAwarded: prediction.totalMarksAwarded,
              totalAvailableMarks: prediction.totalAvailableMarks,
              totalPercentage: prediction.percentage,
              attempts: group.length,
              analysableAttempts: prediction.analysableCount,
            };
          })
          .filter((item) => item.analysableAttempts > 0)
          .sort((a, b) => a.subject.localeCompare(b.subject) || (a.examType ?? "").localeCompare(b.examType ?? ""));

        const now = new Date();
        const cards = (cardsResponse.data || []) as DashboardCardRow[];
        const sessions = ((sessionsResponse.data || []) as DashboardSessionRow[]).map((item) => ({
          id: item.id,
          deckName: getDeckName(item),
          startedAt: item.started_at || "",
          durationMinutes: item.duration_minutes || 0,
          cardsStudied: item.cards_studied || 0,
        }));

        const studyStreak = calculateStudyStreak(
          sessions.map((s) => new Date(s.startedAt).getTime()).filter((t) => Number.isFinite(t))
        );
        const retentionRate = calculateRetentionRate(
          cards.map((c) => ({ repetition_count: c.repetition_count || 0, consecutive_correct: c.consecutive_correct || 0 }))
        );
        const todayKey = now.toDateString();
        const cardsStudiedToday = sessions
          .filter((s) => s.startedAt && new Date(s.startedAt).toDateString() === todayKey)
          .reduce((sum, s) => sum + s.cardsStudied, 0);
        const goalProgress = calculateGoalProgress(cardsStudiedToday, DEFAULT_DAILY_GOAL, studyStreak);
        const motivationMessage = getMotivationMessage(studyStreak, retentionRate);

        setSubjectLookup(savedSubjects);
        setMetrics({
          deckCount: deckRows.length,
          totalCards: cards.length || deckRows.reduce((sum, d) => sum + (d.card_count || 0), 0),
          dueCards: cards.filter((card) => {
            if (!card.next_review_date) return true;
            const nextReview = new Date(card.next_review_date);
            return Number.isNaN(nextReview.getTime()) || nextReview <= now;
          }).length,
          reviewedCards: cards.filter((card) => (card.times_studied || 0) > 0).length,
          sessionsCompleted: sessions.length,
          totalStudyMinutes: sessions.reduce((sum, s) => sum + s.durationMinutes, 0),
          cardsStudied: sessions.reduce((sum, s) => sum + s.cardsStudied, 0),
          studyStreak,
          recentSessions: sessions.slice(0, 3),
          recentPracticeAttempts,
          topWeaknesses,
          examAttemptsCount: attempts.length,
          primaryExamType,
          retentionRate,
          cardsStudiedToday,
          goalProgress,
          motivationMessage,
          latestPracticePercentage:
            typeof latestAttempt?.percentage === "number" && Number.isFinite(latestAttempt.percentage)
              ? latestAttempt.percentage
              : null,
          latestPracticeGrade: latestAttempt?.predicted_grade || null,
          subjectPredictedGrades,
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
  }, [session?.user?.id, isTeacher, isParent]);

  const handlePracticeWeakness = (weakness: WeaknessEntry) => {
    const subject = subjectLookup.find((s) => weakness.subjects.includes(s.subject));
    const params = new URLSearchParams();
    if (subject) params.set("subjectId", subject.id);
    params.set("topic", weakness.tag);
    router.push(`/dashboard/ai-questions?${params.toString()}`);
  };

  const handleGenerateWeaknessFlashcards = async (weakness: WeaknessEntry) => {
    const subject = subjectLookup.find((s) => weakness.subjects.includes(s.subject));
    if (!subject?.exam_board || !subject?.exam_type) {
      showToast("error", "Add this subject with its exam board and type on the Subjects page first.");
      return;
    }
    setIsGeneratingFlashcards(true);
    try {
      const response = await fetch("/api/ai/generate-flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Fix: ${weakness.tag}`.slice(0, 120),
          subject: subject.subject,
          examBoard: subject.exam_board,
          examType: subject.exam_type,
          prompt: `The student keeps losing marks on this recurring exam-practice weakness: "${weakness.tag}". Create flashcards that directly target and help fix this specific weakness, not general subject revision.`,
          cardCount: 12,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        showToast("error", body.error || "Could not generate flashcards for this weakness.");
        return;
      }
      showToast("success", `Created ${body.created} flashcards to fix this weakness. Check your Flashcards page.`);
    } catch {
      showToast("error", "Could not generate flashcards due to a network error.");
    } finally {
      setIsGeneratingFlashcards(false);
    }
  };

  const displayName =
    profile?.first_name || profile?.username || session?.user.email?.split("@")[0] || "there";

  if (isAuthLoading || isTeacher || isParent) return null;

  return (
    <div className="space-y-6">

      <RevisionCycleStepper />

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-indigo-100 dark:border-indigo-500/20 bg-linear-to-br from-indigo-50 via-white to-purple-50 dark:from-[#131B2E] dark:via-[#111829] dark:to-[#0e1525] p-6 sm:p-8">
        {/* Ambient blobs */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-8 right-24 h-48 w-48 rounded-full bg-purple-500/10 blur-2xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-8">
          {/* Left: greeting */}
          <div>
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              <Sparkles className="h-3 w-3" />
              Your Personal AI Revision Coach
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              Welcome back,{" "}
              <span className="bg-linear-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                {displayName}
              </span>
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 sm:text-base">
              Your AI tutor has analysed your progress. Here&apos;s what to focus on today.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="relative mt-6">
          <Link
            href="/dashboard/subjects"
            className={buttonStyles({ variant: 'primary', size: 'lg', className: 'shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-px' })}
          >
            <GraduationCap className="h-4 w-4" />
            Subjects
          </Link>
        </div>

        {loadError && (
          <p className="relative mt-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-700/40 dark:bg-red-950/30 px-4 py-3 text-sm text-red-800 dark:text-red-300">
            {loadError}
          </p>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-emerald-500 to-teal-500">
              <Trophy className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Predicted Grades</h2>
          </div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            Exam practice only
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-white/6 dark:bg-white/5 dark:text-slate-400 sm:grid-cols-[1.15fr_0.75fr_0.5fr_auto]">
            <span>Subject</span>
            <span className="hidden sm:block">Qualification</span>
            <span className="hidden sm:block">Total Score</span>
            <span className="text-right">Grade</span>
          </div>

          {isLoading ? (
            <div className="space-y-px p-4">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
              ))}
            </div>
          ) : metrics.subjectPredictedGrades.length === 0 ? (
            <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
              Complete exam practice to build your report card.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/6">
              {metrics.subjectPredictedGrades.map((item) => (
                <article
                  key={`${item.subject}-${item.examType ?? "unknown"}-${item.examBoard ?? "board"}-${item.specTier ?? "tier"}`}
                  className="grid grid-cols-[1fr_auto] gap-3 px-5 py-4 sm:grid-cols-[1.15fr_0.75fr_0.5fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{getSubjectLabel(item.subject)}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 sm:hidden">
                      {formatQualificationLabel({
                        examBoard: item.examBoard,
                        examType: item.examType,
                        specTier: item.specTier,
                        grade: item.predictedGrade,
                      })}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300 sm:hidden">
                      Total score: {formatTotalScoreLabel(item)}
                    </p>
                  </div>
                  <p className="hidden text-sm text-slate-600 dark:text-slate-300 sm:block">
                    {formatQualificationLabel({
                      examBoard: item.examBoard,
                      examType: item.examType,
                      specTier: item.specTier,
                      grade: item.predictedGrade,
                      fallback: "Pending",
                    })}
                  </p>
                  <p className="hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
                    {formatTotalScoreLabel(item)}
                  </p>
                  <span className={`inline-flex min-w-14 justify-center rounded-lg px-3 py-1.5 text-sm font-black ${gradeBadgeTone({
                    grade: item.predictedGrade,
                    examType: item.examType,
                    specTier: item.specTier,
                  })}`}>
                    {item.predictedGrade}
                  </span>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Recent Smart Practice */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-indigo-500 to-purple-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Recent Smart Practice</h2>
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
              Latest 5
            </span>
          </div>
          {metrics.examAttemptsCount > 0 ? (
            <Link href="/dashboard/ai-questions/stats" className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
              View all statistics
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-2xl border border-indigo-200 bg-white dark:border-indigo-500/25 dark:bg-[#131B2E]">
          {isLoading ? (
            <div className="space-y-px p-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
              ))}
            </div>
          ) : metrics.recentPracticeAttempts.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-500/10">
                <Sparkles className="h-6 w-6 text-indigo-500" />
              </div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">No practice attempts yet</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Complete a marked practice attempt to see your recent scores here.
              </p>
              <Link href="/dashboard/ai-questions" className={buttonStyles({ variant: 'primary', className: 'mt-4' })}>
                Smart Practice
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/6">
              {metrics.recentPracticeAttempts.map((attempt) => (
                <Link
                  key={attempt.id}
                  href={`/dashboard/ai-questions/stats/${attempt.id}`}
                  className="grid gap-3 px-5 py-4 transition hover:bg-indigo-50/50 dark:hover:bg-indigo-500/8 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {attempt.topic}
                      {attempt.attemptMode === "mock" ? (
                        <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
                          Mock
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {capitalize(attempt.subject)} - {attempt.examType === "a-level" ? "A-Level" : "GCSE"} - {formatDate(attempt.createdAt)}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {attempt.percentage === null ? "--" : `${attempt.percentage}%`}
                  </span>
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${gradeBadgeTone({
                    grade: attempt.predictedGrade,
                    examType: attempt.examType,
                    specTier: attempt.specTier,
                  })}`}>
                    {attempt.predictedGrade || "N/A"}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {attempt.totalMarksAwarded ?? "--"} / {attempt.totalAvailableMarks ?? "--"} marks
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Learning Journey + Recent Sessions ─────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">

        {/* Recommended Next Step (fed by weakness_tags + due reviews, not a static checklist) */}
        <section className="flex flex-col">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-blue-500 to-cyan-500">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Recommended Next Step</h2>
          </div>

          <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-6 shadow-sm dark:shadow-none">
            {isLoading ? (
              <div className="space-y-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100 dark:bg-white/5" />
                <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
              </div>
            ) : (
              <>
                {metrics.motivationMessage ? (
                  <p className="mb-5 text-sm text-slate-600 dark:text-slate-400">{metrics.motivationMessage}</p>
                ) : null}

                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center dark:border-white/6 dark:bg-white/3">
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Retention</p>
                    <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{Math.round(metrics.retentionRate)}%</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center dark:border-white/6 dark:bg-white/3">
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Today&apos;s goal</p>
                    <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{metrics.cardsStudiedToday}/{DEFAULT_DAILY_GOAL}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center dark:border-white/6 dark:bg-white/3">
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Streak</p>
                    <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{metrics.studyStreak}d</p>
                  </div>
                </div>

                <div className="mt-5 flex-1">
                  {metrics.topWeaknesses[0] ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/25 dark:bg-amber-500/10">
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                        Your most common weak area: &ldquo;{metrics.topWeaknesses[0].tag}&rdquo;
                      </p>
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        {metrics.topWeaknesses[0].subjects.map(getSubjectLabel).join(", ")} · seen {metrics.topWeaknesses[0].count}×
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handlePracticeWeakness(metrics.topWeaknesses[0])}
                          className={buttonStyles({ variant: "primary", size: "sm" })}
                        >
                          Practice this topic
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenerateWeaknessFlashcards(metrics.topWeaknesses[0])}
                          disabled={isGeneratingFlashcards}
                          className={buttonStyles({ variant: "secondary", size: "sm" })}
                        >
                          {isGeneratingFlashcards ? "Generating..." : "Generate flashcards"}
                        </button>
                      </div>
                    </div>
                  ) : metrics.dueCards > 0 ? (
                    <Link
                      href="/dashboard/study-sessions"
                      className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-semibold text-indigo-900 transition hover:bg-indigo-100 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-100"
                    >
                      {metrics.dueCards} cards are due for review
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : metrics.examAttemptsCount === 0 ? (
                    <Link
                      href="/dashboard/ai-questions"
                      className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100"
                    >
                      Take your first Smart Practice test to get personalised recommendations
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <Link
                      href="/dashboard/ai-questions"
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/6 dark:bg-white/3 dark:text-slate-200"
                    >
                      Keep practising to sharpen your predicted grades
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Recent Sessions */}
        <section className="flex flex-col">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Recent Sessions</h2>
            <Link
              href="/dashboard/study-sessions"
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            >
              View all →
            </Link>
          </div>

          <div className="flex-1 rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] overflow-hidden shadow-sm dark:shadow-none">
            {isLoading ? (
              <div className="space-y-px p-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
                ))}
              </div>
            ) : metrics.recentSessions.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Brain className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No sessions yet</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Flashcard Revision
                </p>
                <Link
                  href="/dashboard/study-sessions"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-500/30 transition-colors"
                >
                  Flashcard Revision <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/4">
                {metrics.recentSessions.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-500/15 text-indigo-500 dark:text-indigo-400">
                      <Brain className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {item.deckName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDate(item.startedAt)} · {formatMinutes(item.durationMinutes)} · {item.cardsStudied} cards
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

