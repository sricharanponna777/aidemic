import { gradeFromPercentage, gradeScaleOrder } from '@/lib/ai/gradeScales';

export const normalisePredictedGrade = (grade: string | null | undefined) =>
  (grade ?? '').trim().toUpperCase();

export const averagePredictedGrade = (
  grades: Array<string | null | undefined>,
  examType: string | null | undefined
) => {
  const scale = gradeScaleOrder(examType);
  const values = grades
    .map((grade) => scale.indexOf(normalisePredictedGrade(grade)))
    .filter((value) => value >= 0);

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
  const attempts = allAttempts.filter((attempt) => attempt.attempt_mode !== 'blurt');

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
