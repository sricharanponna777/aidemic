'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, Flame, Target } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { PageLoader } from '@/components/PageLoader';
import { calculateStudyStreak } from '@/lib/spacedRepetition';
import { useLinkedChildren } from '../ParentChildContext';

type SessionRow = { started_at: string | null; duration_minutes: number | null };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKS_SHOWN = 13;

const dayKey = (d: Date) => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
};

function heatColor(count: number) {
  if (count === 0) return 'bg-slate-100 dark:bg-white/5';
  if (count === 1) return 'bg-indigo-200 dark:bg-indigo-500/30';
  if (count <= 3) return 'bg-indigo-400 dark:bg-indigo-500/60';
  return 'bg-indigo-600 dark:bg-indigo-400';
}

export default function ParentActivityPage() {
  const supabase = createClient();
  const { selectedStudentId } = useLinkedChildren();

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [attemptDates, setAttemptDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  // Captured once at mount so the memoised heatmap/week calculations stay pure.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!selectedStudentId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [sessionsResponse, attemptsResponse] = await Promise.all([
        supabase.from('study_sessions').select('started_at, duration_minutes').eq('user_id', selectedStudentId),
        supabase.from('exam_practice_attempts').select('created_at').eq('user_id', selectedStudentId).limit(500),
      ]);
      if (cancelled) return;
      setSessions((sessionsResponse.data ?? []) as SessionRow[]);
      setAttemptDates(
        ((attemptsResponse.data ?? []) as Array<{ created_at: string | null }>)
          .map((a) => a.created_at)
          .filter((d): d is string => !!d)
      );
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedStudentId, supabase]);

  const stats = useMemo(() => {
    const sessionTimestamps = sessions
      .map((s) => (s.started_at ? new Date(s.started_at).getTime() : NaN))
      .filter((t) => Number.isFinite(t));
    const attemptTimestamps = attemptDates.map((d) => new Date(d).getTime()).filter((t) => Number.isFinite(t));
    const allActivity = [...sessionTimestamps, ...attemptTimestamps];

    const streak = calculateStudyStreak(allActivity);
    const totalMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
    const weekAgo = now - WEEK_MS;
    const sessionsThisWeek = sessionTimestamps.filter((t) => t >= weekAgo).length;
    const attemptsThisWeek = attemptTimestamps.filter((t) => t >= weekAgo).length;

    // per-day activity counts for the heatmap
    const perDay = new Map<number, number>();
    for (const t of allActivity) {
      const key = dayKey(new Date(t));
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }

    return { streak, totalMinutes, sessionsThisWeek, attemptsThisWeek, perDay };
  }, [sessions, attemptDates, now]);

  const weeks = useMemo(() => {
    // Build a WEEKS_SHOWN-column grid ending this week, each column a Sun→Sat run.
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const endSunday = new Date(today);
    endSunday.setDate(today.getDate() - today.getDay()); // Sunday of current week
    const start = new Date(endSunday);
    start.setDate(endSunday.getDate() - (WEEKS_SHOWN - 1) * 7);

    const cols: { date: Date; count: number; future: boolean }[][] = [];
    for (let w = 0; w < WEEKS_SHOWN; w += 1) {
      const col: { date: Date; count: number; future: boolean }[] = [];
      for (let d = 0; d < 7; d += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        col.push({ date, count: stats.perDay.get(dayKey(date)) ?? 0, future: date.getTime() > today.getTime() });
      }
      cols.push(col);
    }
    return cols;
  }, [stats.perDay, now]);

  if (loading) {
    return <PageLoader text="Loading activity..." />;
  }

  if (!selectedStudentId) return null;

  const hours = Math.floor(stats.totalMinutes / 60);
  const minutes = stats.totalMinutes % 60;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Flame className="h-3.5 w-3.5 text-orange-500" />
            Study streak
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stats.streak}d</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Clock className="h-3.5 w-3.5 text-indigo-500" />
            Total study time
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {hours > 0 ? `${hours}h ` : ''}
            {minutes}m
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <CalendarDays className="h-3.5 w-3.5 text-emerald-500" />
            Sessions this week
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stats.sessionsThisWeek}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Target className="h-3.5 w-3.5 text-purple-500" />
            Practice this week
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stats.attemptsThisWeek}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
        <div className="mb-4 flex items-center gap-2.5">
          <CalendarDays className="h-5 w-5 text-indigo-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Activity — last {WEEKS_SHOWN} weeks</h2>
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-1">
            {weeks.map((col, i) => (
              <div key={i} className="flex flex-col gap-1">
                {col.map((cell, j) => (
                  <div
                    key={j}
                    title={`${cell.date.toLocaleDateString()} — ${cell.count} ${cell.count === 1 ? 'activity' : 'activities'}`}
                    className={`h-3 w-3 rounded-sm ${cell.future ? 'bg-transparent' : heatColor(cell.count)}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>Less</span>
          <div className="h-3 w-3 rounded-sm bg-slate-100 dark:bg-white/5" />
          <div className="h-3 w-3 rounded-sm bg-indigo-200 dark:bg-indigo-500/30" />
          <div className="h-3 w-3 rounded-sm bg-indigo-400 dark:bg-indigo-500/60" />
          <div className="h-3 w-3 rounded-sm bg-indigo-600 dark:bg-indigo-400" />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
