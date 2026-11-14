"use client";

import { useAuth } from "@/hooks/useAuth";
import { calculateGoalProgress, calculateRetentionRate, calculateStudyStreak, getMotivationMessage } from "@/lib/spacedRepetition";
import { createClient } from "@/lib/supabase-client";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Radar,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { useToast } from "@/components/ToastProvider";
import { Flashcard, FlashcardDeck, StudySession } from "@/types";
import { weightedPredictedGrade } from "@/lib/ai/gradeAverages";
import { describeMasteryCoverage, emptyMasteryCoverage, masteryCoverage, type MasteryCoverage } from "@/lib/ai/gradeFromMastery";
import { readSpecificationSubtopicCounts, readStudentMastery } from "@/lib/mastery/read";
import { getExamBoardLabel, getExamTypeLabel, getSubjectLabel } from "@/lib/ai/subjectConfig";
import type { ExamType } from "@/lib/ai/qualifications";
import { gcseTierLabelForGrade, gradeBadgeTone } from "@/lib/gradeTone";
import { mapStudentSubjectRow, STUDENT_SUBJECT_SELECT, type StudentSubjectRow } from "@/lib/ai/studentSubjects";
import { PageHeader } from "@/components/ui/feedback";
import { Alert } from "@/components/ui/field";
import { Chip, Meter, MonoLabel, Panel, PanelHeading, Stat, Workspace, WorkspaceBody } from "@/components/ui/telemetry";
import { DEFAULT_STUDY_GOALS, fetchStudyGoals } from "@/lib/studyGoals";
import { BarChart } from "@/components/ui/charts";
import { countLeeches } from "@/lib/leeches";
import { countDueCards } from "@/lib/flashcardsDue";
import { rankWeaknesses, trendLabel, type RankedWeakness } from "@/lib/weaknesses";
import { GetStartedChecklist } from "@/components/GetStartedChecklist";
import { loadStudentChecklist, type ChecklistItem } from "@/lib/onboarding/checklist";

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
  examType: ExamType | null;
  specTier: string | null;
  percentage: number | null;
  predictedGrade: string | null;
  totalMarksAwarded: number | null;
  totalAvailableMarks: number | null;
  createdAt: string;
  attemptMode: string | null;
};

type WeaknessEntry = RankedWeakness;

type SubjectPredictedGrade = {
  subject: string;
  examBoard: string | null;
  examType: ExamType | null;
  specTier: string | null;
  predictedGrade: string;
  /** How much of the specification the grade actually rests on. */
  coverage: MasteryCoverage;
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
  primaryExamType: ExamType | null;
  latestPracticePercentage: number | null;
  latestPracticeGrade: string | null;
  subjectPredictedGrades: SubjectPredictedGrade[];
  retentionRate: number;
  cardsStudiedToday: number;
  leechCount: number;
  activitySeries: { label: string; value: number }[];
  dailyGoal: number;
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
type DashboardCardRow = Pick<Flashcard, "deck_id" | "next_review_date" | "times_studied" | "times_correct" | "repetition_count" | "consecutive_correct">;
type DashboardSessionRow = Pick<StudySession, "id" | "started_at" | "duration_minutes" | "cards_studied"> & {
  flashcard_decks?: { name?: string } | Array<{ name?: string }> | null;
};

// Daily target now comes from the user's study_goals row; DEFAULT_STUDY_GOALS
// supplies the fallback when they have never saved one.

const emptyMetrics: DashboardMetrics = {
  deckCount: 0, totalCards: 0, dueCards: 0, reviewedCards: 0,
  sessionsCompleted: 0, totalStudyMinutes: 0,
  cardsStudied: 0, studyStreak: 0,
  recentSessions: [], recentPracticeAttempts: [], topWeaknesses: [], examAttemptsCount: 0,
  primaryExamType: null, latestPracticePercentage: null, latestPracticeGrade: null,
  subjectPredictedGrades: [],
  retentionRate: 0, cardsStudiedToday: 0,
  leechCount: 0,
  activitySeries: [],
  dailyGoal: DEFAULT_STUDY_GOALS.daily_card_target,
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
  examType?: ExamType | null;
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

// Cards reviewed per day over the last `days` days, oldest first. Used by the
// dashboard activity bar chart.
const buildActivitySeries = (
  sessions: { startedAt: string; cardsStudied: number }[],
  days = 14
): { label: string; value: number }[] => {
  const buckets = new Map<string, number>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const series: { label: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    buckets.set(d.toDateString(), 0);
  }
  for (const s of sessions) {
    if (!s.startedAt) continue;
    const d = new Date(s.startedAt);
    if (Number.isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    const key = d.toDateString();
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + s.cardsStudied);
  }
  for (const [key, value] of buckets) {
    series.push({ label: new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric" }).format(new Date(key)), value });
  }
  return series;
};

const weaknessTrendStyles = (trend: RankedWeakness["trend"]) => {
  const tone =
    trend === "worsening"
      ? "bg-danger-muted text-danger"
      : trend === "improving"
        ? "bg-success-muted text-success"
        : trend === "new"
          ? "bg-info-muted text-info"
          : "bg-warning-muted text-warning";
  return `shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${tone}`;
};

const formatLastSeen = (daysAgo: number) =>
  daysAgo <= 0 ? "last seen today" : daysAgo === 1 ? "last seen yesterday" : `last seen ${daysAgo}d ago`;

export default function Dashboard() {
  const { session, profile, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [subjectLookup, setSubjectLookup] = useState<DashboardSubjectRow[]>([]);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [isChecklistLoading, setIsChecklistLoading] = useState(true);
  const isTeacher = profile?.role === "teacher";
  const isParent = profile?.role === "parent";

  useEffect(() => {
    if (isTeacher) router.replace("/dashboard/teacher");
    else if (isParent) router.replace("/dashboard/parent");
  }, [isTeacher, isParent, router]);

  // Kept out of the main dashboard load: five head-only counts are cheap, and
  // folding them in would delay every metric behind them.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || isTeacher || isParent) return;
    let cancelled = false;
    const load = async () => {
      const items = await loadStudentChecklist(createClient(), userId);
      if (cancelled) return;
      setChecklist(items);
      setIsChecklistLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, isTeacher, isParent]);

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

        const [cardsResponse, sessionsResponse, attemptsResponse, subjectsResponse, studyGoals, masteryRows] = await Promise.all([
          deckIds.length > 0
            ? supabase
                .from("flashcards")
                .select("deck_id, next_review_date, times_studied, times_correct, repetition_count, consecutive_correct")
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
            .limit(200),
          supabase
            .from("student_subjects")
            .select(`specification_id, ${STUDENT_SUBJECT_SELECT}`)
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: true }),
          fetchStudyGoals(supabase, session.user.id),
          // Coverage is a count, so it needs every measured row rather than the
          // default 200 the practice queue is sized for.
          readStudentMastery(supabase, session.user.id, { limit: 2000 }),
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
        const subjectRows = (subjectsResponse.data ?? []) as unknown as (StudentSubjectRow & {
          specification_id: string | null;
        })[];
        const savedSubjects = subjectRows.map(mapStudentSubjectRow) as DashboardSubjectRow[];

        // Coverage needs a denominator per specification, and mastery rows carry
        // only the subject name, so keep the link between the two here.
        const specificationBySubject = new Map<string, string>();
        subjectRows.forEach((row, index) => {
          if (row.specification_id) specificationBySubject.set(savedSubjects[index].subject, row.specification_id);
        });
        const subtopicCounts = await readSpecificationSubtopicCounts(supabase, [
          ...specificationBySubject.values(),
        ]);
        // "Latest practice score" has to be a practice score: a blurt row carries
        // a free-recall coverage %, which would read as an exam result it is not.
        const latestAttempt = attempts.find((attempt) => attempt.attempt_mode !== "blurt");
        const primaryExamType = (attempts[0]?.exam_type ?? null) as ExamType | null;
        // Recency-weighted so the headline weakness reflects what is costing
        // marks now, not whatever was most common over the student's lifetime.
        const topWeaknesses: WeaknessEntry[] = rankWeaknesses(
          attempts.map((attempt) => ({
            createdAt: attempt.created_at ?? null,
            subject: attempt.subject,
            tags: (attempt.weakness_tags?.length ? attempt.weakness_tags : attempt.weakness_analysis) ?? [],
          }))
        );
        const recentPracticeAttempts: RecentPracticeAttempt[] = attempts.slice(0, 5).map((attempt) => ({
          id: attempt.id,
          topic: attempt.topic || "Practice attempt",
          subject: attempt.subject,
          examType: (attempt.exam_type ?? null) as ExamType | null,
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
          const examType = (attempt.exam_type ?? null) as ExamType | null;
          const key = `${attempt.subject}|${examType ?? "unknown"}`;
          subjectGroups.set(key, [...(subjectGroups.get(key) ?? []), attempt]);
        }
        const subjectReportKeys = new Map<string, DashboardSubjectRow>();
        for (const group of subjectGroups.values()) {
          const first = group[0];
          const examType = (first.exam_type ?? null) as ExamType | null;
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
            const examType = (subject.exam_type ?? null) as ExamType | null;
            const group = subjectGroups.get(`${subject.subject}|${examType ?? "unknown"}`) ?? [];
            const prediction = weightedPredictedGrade(group, examType, subject.spec_tier, subject.exam_board);
            const specificationId = specificationBySubject.get(subject.subject);
            const coverage = specificationId
              ? masteryCoverage(
                  masteryRows.filter((row) => row.scope.subject === subject.subject),
                  subtopicCounts.get(specificationId) ?? 0
                )
              : emptyMasteryCoverage();
            return {
              subject: subject.subject,
              examBoard: subject.exam_board ?? null,
              examType,
              specTier: subject.spec_tier ?? null,
              predictedGrade: prediction.grade,
              coverage,
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
          cards.map((c) => ({ times_studied: c.times_studied || 0, times_correct: c.times_correct || 0 }))
        );
        const todayKey = now.toDateString();
        const cardsStudiedToday = sessions
          .filter((s) => s.startedAt && new Date(s.startedAt).toDateString() === todayKey)
          .reduce((sum, s) => sum + s.cardsStudied, 0);
        const dailyGoal = studyGoals.daily_card_target;
        const leechCount = countLeeches(cards);
        const activitySeries = buildActivitySeries(sessions, 14);
        const goalProgress = calculateGoalProgress(cardsStudiedToday, dailyGoal, studyStreak);
        const motivationMessage = getMotivationMessage(studyStreak, retentionRate);

        setSubjectLookup(savedSubjects);
        setMetrics({
          deckCount: deckRows.length,
          totalCards: cards.length || deckRows.reduce((sum, d) => sum + (d.card_count || 0), 0),
          dueCards: countDueCards(cards, now),
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
          dailyGoal,
          leechCount,
          activitySeries,
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

  // Held back until the metrics land: `metrics` starts empty, so testing the
  // count alone greets every returning user as a first-timer while loading.
  const hasNoPractice = !isLoading && metrics.examAttemptsCount === 0;

  if (isAuthLoading || isTeacher || isParent) return null;

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Today</PanelHeading>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Retention" value={isLoading ? "…" : `${Math.round(metrics.retentionRate)}%`} />
        <Stat label="Streak" value={isLoading ? "…" : `${metrics.studyStreak}d`} />
        <Stat label="Today's goal" value={isLoading ? "…" : `${metrics.cardsStudiedToday}/${metrics.dailyGoal}`} />
        <Stat label="Cards due" value={isLoading ? "…" : metrics.dueCards} tone={metrics.dueCards > 0 ? "warning" : "default"} />
      </div>
      {!isLoading && metrics.dailyGoal > 0 ? (
        <Meter fraction={metrics.cardsStudiedToday / metrics.dailyGoal} label="Today's goal" />
      ) : null}

      {/* ── Leeches: cards you keep getting wrong ──────────────────── */}
      {metrics.leechCount > 0 && (
        <Link
          href="/dashboard/flashcards"
          className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger-muted p-4 transition hover:brightness-[0.98]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-content">Fix these first</p>
            <p className="text-[13px] text-content-muted">
              {metrics.leechCount} leech {metrics.leechCount === 1 ? "card keeps" : "cards keep"} tripping you up — open a deck and
              filter to leeches.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-content-subtle" />
        </Link>
      )}

      {/* Recent Sessions */}
      <Panel className="overflow-hidden p-0">
        <div className="border-b border-subtle px-4 py-3">
          <PanelHeading
            icon={Brain}
            as="h3"
            aside={
              <Link href="/dashboard/study-sessions" className="font-mono text-xs text-accent hover:underline">
                View all →
              </Link>
            }
          >
            Recent sessions
          </PanelHeading>
        </div>
        {!isLoading && metrics.activitySeries.some((d) => d.value > 0) && (
          <div className="border-b border-subtle p-4">
            <MonoLabel className="mb-2">Cards reviewed · last 14 days</MonoLabel>
            <BarChart data={metrics.activitySeries} suffix=" cards" ariaLabel="Cards reviewed per day over the last 14 days" />
          </div>
        )}
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-sunken" />
            ))}
          </div>
        ) : metrics.recentSessions.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-sm font-semibold text-content">No sessions yet</p>
            <Link href="/dashboard/study-sessions" className={buttonStyles({ variant: "secondary", size: "sm", className: "mt-3" })}>
              Flashcard Revision <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-subtle">
            {metrics.recentSessions.map((item) => (
              <li key={item.id} className="px-4 py-3">
                <p className="truncate text-sm font-semibold text-content">{item.deckName}</p>
                <p className="font-mono text-[11px] text-content-subtle">
                  {formatDate(item.startedAt)} · {formatMinutes(item.durationMinutes)} · {item.cardsStudied} cards
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={LayoutDashboard}
        eyebrow="Workspace / Dashboard"
        title={`Welcome back, ${displayName}`}
        description={
          hasNoPractice
            ? "Complete your first Smart Practice and AIDemic will personalise your revision."
            : "Your AI tutor has analysed your progress. Here's what to focus on today."
        }
        actions={
          <>
            <Chip>● {isLoading ? "…" : metrics.examAttemptsCount} practice attempts</Chip>
            {metrics.dueCards > 0 ? (
              <Chip tone="warning">
                <Layers className="h-3 w-3" /> {metrics.dueCards} cards due
              </Chip>
            ) : null}
            <Link href="/dashboard/subjects" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <GraduationCap className="h-4 w-4" />
              Subjects
            </Link>
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        {loadError && (
          <div className="border-b border-subtle p-4">
            <Alert>{loadError}</Alert>
          </div>
        )}

        <div className="space-y-6 p-5">
          <GetStartedChecklist items={checklist} loading={isChecklistLoading} />

          {/* Recommended Next Step (fed by weakness_tags + due reviews, not a static checklist) */}
          <section>
            <PanelHeading icon={Sparkles} className="mb-3">
              Recommended next step
            </PanelHeading>
            {isLoading ? (
              <div className="space-y-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-surface-sunken" />
                <div className="h-24 animate-pulse rounded-lg bg-surface-sunken" />
              </div>
            ) : (
              <div className="flex gap-3 rounded-lg border border-subtle bg-surface-sunken p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-subtle bg-surface text-content-subtle">
                  <Target className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  {metrics.topWeaknesses[0] ? (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <MonoLabel>Focus on this next</MonoLabel>
                        <span className={weaknessTrendStyles(metrics.topWeaknesses[0].trend)}>
                          {trendLabel(metrics.topWeaknesses[0].trend)}
                        </span>
                      </div>
                      <p className="mt-1 text-body font-semibold text-content">&ldquo;{metrics.topWeaknesses[0].tag}&rdquo;</p>
                      <p className="mt-1 font-mono text-xs text-content-subtle">
                        {metrics.topWeaknesses[0].subjects.map(getSubjectLabel).join(", ")} · seen {metrics.topWeaknesses[0].count}× ·{" "}
                        {formatLastSeen(metrics.topWeaknesses[0].lastSeenDaysAgo)}
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
                    </>
                  ) : metrics.dueCards > 0 ? (
                    // Daily Review, not study-sessions: this count is across every
                    // deck, and a study session is one deck at a time, so the
                    // number the student clicked was never the one they then saw.
                    <Link href="/dashboard/daily-review" className="flex items-center justify-between gap-3 text-body font-semibold text-content hover:text-accent">
                      {metrics.dueCards} cards are due for review
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : metrics.examAttemptsCount === 0 ? (
                    <Link href="/dashboard/ai-questions" className="flex items-center justify-between gap-3 text-body font-semibold text-content hover:text-accent">
                      Take your first Smart Practice test to get personalised recommendations
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <Link href="/dashboard/ai-questions" className="flex items-center justify-between gap-3 text-body font-semibold text-content hover:text-accent">
                      Keep practising to sharpen your predicted grades
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                  {metrics.motivationMessage ? (
                    <p className="mt-3 border-t border-subtle pt-3 text-[13px] text-content-subtle">{metrics.motivationMessage}</p>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          <section>
            <PanelHeading icon={Trophy} aside={<Chip tone="success">Exam practice only</Chip>}>
              Current predicted grades
            </PanelHeading>
            <p className="mb-3 mt-1 text-[13px] text-content-subtle">
              Built up from every attempt you have made and how much of the specification you have covered — so it moves slower than any
              single result, and will differ from one assignment&apos;s grade equivalent.
            </p>

            <div className="overflow-hidden rounded-lg border border-subtle bg-surface">
              <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-subtle bg-surface-sunken px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-content-subtle sm:grid-cols-[1.15fr_0.75fr_0.5fr_auto]">
                <span>Subject</span>
                <span className="hidden sm:block">Qualification</span>
                <span className="hidden sm:block">Total score</span>
                <span className="text-right">Grade</span>
              </div>

              {isLoading ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3, 4].map((item) => (
                    <div key={item} className="h-12 animate-pulse rounded-lg bg-surface-sunken" />
                  ))}
                </div>
              ) : metrics.subjectPredictedGrades.length === 0 ? (
                <div className="p-5 text-sm text-content-subtle">Complete exam practice to build your report card.</div>
              ) : (
                <div className="divide-y divide-subtle">
                  {metrics.subjectPredictedGrades.map((item) => (
                    <article
                      key={`${item.subject}-${item.examType ?? "unknown"}-${item.examBoard ?? "board"}-${item.specTier ?? "tier"}`}
                      className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 sm:grid-cols-[1.15fr_0.75fr_0.5fr_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-content">{getSubjectLabel(item.subject)}</p>
                        <p className="mt-0.5 text-xs text-content-subtle sm:hidden">
                          {formatQualificationLabel({
                            examBoard: item.examBoard,
                            examType: item.examType,
                            specTier: item.specTier,
                            grade: item.predictedGrade,
                          })}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-content-muted sm:hidden">Total score: {formatTotalScoreLabel(item)}</p>
                        {/* How much of the course the grade rests on. The grade
                            itself stays mark-based; this says how far to trust it. */}
                        {describeMasteryCoverage(item.coverage) ? (
                          <p className="mt-0.5 text-xs text-content-subtle">{describeMasteryCoverage(item.coverage)}</p>
                        ) : null}
                      </div>
                      <p className="hidden text-sm text-content-muted sm:block">
                        {formatQualificationLabel({
                          examBoard: item.examBoard,
                          examType: item.examType,
                          specTier: item.specTier,
                          grade: item.predictedGrade,
                          fallback: "Pending",
                        })}
                      </p>
                      <p className="hidden font-mono text-xs text-content-subtle sm:block">{formatTotalScoreLabel(item)}</p>
                      <span
                        className={`inline-flex min-w-12 justify-center rounded-md px-2.5 py-1 font-mono text-sm font-bold ${gradeBadgeTone({
                          grade: item.predictedGrade,
                          examType: item.examType,
                          specTier: item.specTier,
                        })}`}
                      >
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
            <PanelHeading
              icon={Sparkles}
              className="mb-3"
              aside={
                metrics.examAttemptsCount > 0 ? (
                  <Link href="/dashboard/ai-questions/stats" className="font-mono text-xs text-accent hover:underline">
                    View all statistics →
                  </Link>
                ) : (
                  <Chip>Latest 5</Chip>
                )
              }
            >
              Recent Smart Practice
            </PanelHeading>

            <div className="overflow-hidden rounded-lg border border-subtle bg-surface">
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-sunken" />
                  ))}
                </div>
              ) : metrics.recentPracticeAttempts.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="font-semibold text-content">No practice attempts yet</p>
                  <p className="mt-1 text-sm text-content-subtle">Complete a marked practice attempt to see your recent scores here.</p>
                  <Link href="/dashboard/ai-questions" className={buttonStyles({ variant: "primary", className: "mt-4" })}>
                    Smart Practice
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-subtle">
                  {metrics.recentPracticeAttempts.map((attempt) => (
                    <Link
                      key={attempt.id}
                      href={`/dashboard/ai-questions/stats/${attempt.id}`}
                      className="grid gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate text-sm font-semibold text-content">
                          {attempt.topic}
                          {attempt.attemptMode === "mock" ? <Chip tone="xp">Mock</Chip> : null}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-content-subtle">
                          {capitalize(attempt.subject)} · {getExamTypeLabel(attempt.examType)} · {formatDate(attempt.createdAt)}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-bold text-content">
                        {attempt.percentage === null ? "--" : `${attempt.percentage}%`}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-center font-mono text-xs font-bold ${gradeBadgeTone({
                          grade: attempt.predictedGrade,
                          examType: attempt.examType,
                          specTier: attempt.specTier,
                        })}`}
                      >
                        {attempt.predictedGrade || "N/A"}
                      </span>
                      <span className="font-mono text-xs text-content-subtle">
                        {attempt.totalMarksAwarded ?? "--"} / {attempt.totalAvailableMarks ?? "--"} marks
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </WorkspaceBody>
    </Workspace>
  );
}
