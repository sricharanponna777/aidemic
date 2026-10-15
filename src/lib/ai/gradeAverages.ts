import { gradeFromPercentage, gradeScaleOrder } from '@/lib/ai/gradeScales';

/**
 * Position of a grade on its ladder, matched case-insensitively.
 *
 * Not `scale.indexOf(grade.trim().toUpperCase())`: upper-casing one side only
 * works while every label is already upper-case, which stops being true the
 * moment a scale reads in words. The entrance-exam ladders are outcome bands --
 * 'Top 500', 'Not qualified', 'Below 50000' -- so 'TOP 500' matched nothing and
 * averagePredictedGrade returned 'N/A' for every JEE Advanced, EAMCET, VITEEE,
 * SRMJEEE, CLAT and IPMAT student who had no mark totals to fall back on.
 *
 * gradeTone.ts states the same rule the other way round ("Matching is
 * case-sensitive here because ladder labels are not all uppercase"); this is the
 * one comparison that disagreed with it.
 */
const indexOnScale = (scale: readonly string[], grade: string | null | undefined): number => {
  const needle = (grade ?? '').trim().toLowerCase();
  if (!needle) return -1;
  return scale.findIndex((label) => label.toLowerCase() === needle);
};

export const averagePredictedGrade = (
  grades: Array<string | null | undefined>,
  examType: string | null | undefined
) => {
  const scale = gradeScaleOrder(examType);
  const values = grades.map((grade) => indexOnScale(scale, grade)).filter((value) => value >= 0);

  if (values.length === 0) {
    return { grade: 'N/A', analysableCount: 0, totalMarksAwarded: null, totalAvailableMarks: null, percentage: null };
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    grade: scale[Math.round(average)] ?? 'N/A',
    analysableCount: values.length,
    totalMarksAwarded: null,
    totalAvailableMarks: null,
    percentage: null,
  };
};

export type PracticeGradeInput = {
  predicted_grade?: string | null;
  total_marks_awarded?: number | null;
  total_available_marks?: number | null;
  attempt_mode?: string | null;
  created_at?: string | null;
};

/**
 * How many of a subject's attempts a predicted grade rests on.
 *
 * The window lives here rather than in each page's `.limit()` because it used
 * to be three different numbers -- 50 on the dashboard, 200 on two parent
 * pages, unbounded on the stats page -- so the same student's same subject
 * showed three different predicted grades depending on who was looking. Doing
 * it here also windows per subject: a global `limit 50` gave a five-subject
 * student about ten attempts each, which is not what any of those pages meant.
 */
export const PREDICTED_GRADE_WINDOW = 50;

/**
 * The newest N attempts, regardless of what order the caller fetched them in.
 *
 * Rows without a `created_at` are left where they are: the function is also
 * called with hand-built inputs in tests and with projections that never
 * selected the column.
 */
const newestAttempts = <T extends PracticeGradeInput>(attempts: T[]): T[] => {
  if (attempts.length <= PREDICTED_GRADE_WINDOW) return attempts;
  const time = (attempt: T) => {
    const parsed = attempt.created_at ? new Date(attempt.created_at).getTime() : Number.NaN;
    return Number.isNaN(parsed) ? -Infinity : parsed;
  };
  return [...attempts].sort((a, b) => time(b) - time(a)).slice(0, PREDICTED_GRADE_WINDOW);
};

export const weightedPredictedGrade = (
  allAttempts: PracticeGradeInput[],
  examType: string | null | undefined,
  specTier?: string | null,
  examBoard?: string | null
) => {
  // Blurting (free recall) records a coverage %, not a mark-scheme score, so it
  // must never contribute to a predicted exam grade even if a future change
  // gives it marks. Exclude it explicitly rather than relying on absent fields.
  const attempts = newestAttempts(allAttempts.filter((attempt) => attempt.attempt_mode !== 'blurt'));

  const markAttempts = attempts.filter(
    (attempt) =>
      typeof attempt.total_marks_awarded === 'number' &&
      Number.isFinite(attempt.total_marks_awarded) &&
      typeof attempt.total_available_marks === 'number' &&
      Number.isFinite(attempt.total_available_marks) &&
      attempt.total_available_marks > 0
  );

  if (markAttempts.length > 0) {
    const awarded = markAttempts.reduce((sum, attempt) => sum + (attempt.total_marks_awarded ?? 0), 0);
    const available = markAttempts.reduce((sum, attempt) => sum + (attempt.total_available_marks ?? 0), 0);
    const percentage = available > 0 ? (awarded / available) * 100 : 0;
    return {
      grade: gradeFromPercentage(percentage, examType, specTier, examBoard),
      analysableCount: markAttempts.length,
      totalMarksAwarded: awarded,
      totalAvailableMarks: available,
      percentage: Math.round(percentage),
    };
  }

  return averagePredictedGrade(attempts.map((attempt) => attempt.predicted_grade), examType);
};
