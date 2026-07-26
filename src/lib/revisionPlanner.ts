/**
 * Revision timetable generation.
 *
 * Pure, side-effect-free planning logic (mirrors the structure of
 * spacedRepetition.ts) so it can be unit tested in isolation. Given a student's
 * subjects — each with an optional exam date and a set of weak topics derived
 * from exam_practice_attempts — it produces a weighted list of study-plan items
 * spread across the days leading up to each exam.
 *
 * Weighting favours (a) subjects whose exams are sooner and (b) subjects with
 * more measured weaknesses, so limited revision time lands where it matters most.
 */

export interface PlannerSubject {
  /** student_subjects.id — carried through onto generated items. */
  id: string;
  label: string;
  /** ISO date (YYYY-MM-DD) of the exam, or null if unknown. */
  examDate: string | null;
  /** Distinct weak-topic labels for this subject (from weakness_tags). */
  weakTopics: string[];
}

export interface PlanItem {
  subjectId: string;
  subjectLabel: string;
  /** ISO date the session is scheduled for. */
  plannedDate: string;
  title: string;
  estimatedMinutes: number;
}

const DAY_MS = 86400000;

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole days from `from` until a subject's exam; null when no/!past exam date. */
export function daysUntilExam(examDate: string | null, from: Date = new Date()): number | null {
  const exam = parseDate(examDate);
  if (!exam) return null;
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const diff = Math.round((exam.getTime() - start.getTime()) / DAY_MS);
  return diff;
}

/**
 * A subject's share of revision effort. More weak topics and a nearer exam both
 * raise the weight. Subjects past their exam, or with no exam date, get 0 — the
 * planner only schedules toward upcoming exams.
 */
export function subjectWeight(subject: PlannerSubject, from: Date = new Date()): number {
  const days = daysUntilExam(subject.examDate, from);
  if (days === null || days < 0) return 0;
  const urgency = 1 / Math.sqrt(days + 1); // sooner exams weigh more, softly
  const weaknessLoad = 1 + subject.weakTopics.length; // at least baseline effort
  return urgency * weaknessLoad;
}

/**
 * Build a revision plan: for each upcoming subject, schedule study sessions on
 * a cadence proportional to its weight, one topic per session, cycling through
 * the subject's weak topics (falling back to a general session when none).
 *
 * @param sessionsPerWeek total sessions to spread across all subjects per week
 * @param horizonDays     how far ahead to plan (capped by each exam date)
 */
export function buildRevisionPlan(
  subjects: PlannerSubject[],
  {
    from = new Date(),
    sessionsPerWeek = 7,
    horizonDays = 28,
    minutesPerSession = 30,
  }: { from?: Date; sessionsPerWeek?: number; horizonDays?: number; minutesPerSession?: number } = {}
): PlanItem[] {
  const active = subjects
    .map((s) => ({ subject: s, weight: subjectWeight(s, from), days: daysUntilExam(s.examDate, from) }))
    .filter((s) => s.weight > 0 && s.days !== null);

  if (active.length === 0) return [];

  const totalWeight = active.reduce((sum, s) => sum + s.weight, 0);
  const totalSessions = Math.round((sessionsPerWeek / 7) * horizonDays);

  const items: PlanItem[] = [];

  for (const { subject, weight, days } of active) {
    const subjectSessions = Math.max(1, Math.round((weight / totalWeight) * totalSessions));
    // Only schedule up to the exam (or the horizon, whichever is sooner).
    const window = Math.max(1, Math.min(days as number, horizonDays));
    const spacing = window / subjectSessions;

    for (let i = 0; i < subjectSessions; i++) {
      const dayOffset = Math.min(window - 1, Math.round(i * spacing));
      const plannedDate = toDateOnly(new Date(from.getTime() + dayOffset * DAY_MS));
      const topic = subject.weakTopics.length > 0
        ? subject.weakTopics[i % subject.weakTopics.length]
        : null;
      items.push({
        subjectId: subject.id,
        subjectLabel: subject.label,
        plannedDate,
        title: topic ? `${subject.label}: ${topic}` : `${subject.label}: general revision`,
        estimatedMinutes: minutesPerSession,
      });
    }
  }

  return items.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
}
