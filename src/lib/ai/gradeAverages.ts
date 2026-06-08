const GCSE_GRADES = ['U', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const A_LEVEL_GRADES = ['U', 'E', 'D', 'C', 'B', 'A', 'A*'];

const getGradeScale = (examType: string | null | undefined) =>
  examType === 'a-level' ? A_LEVEL_GRADES : GCSE_GRADES;

export const normalisePredictedGrade = (grade: string | null | undefined) =>
  (grade ?? '').trim().toUpperCase();

export const averagePredictedGrade = (
  grades: Array<string | null | undefined>,
  examType: string | null | undefined
) => {
  const scale = getGradeScale(examType);
  const values = grades
    .map((grade) => scale.indexOf(normalisePredictedGrade(grade)))
    .filter((value) => value >= 0);

  if (values.length === 0) {
    return { grade: 'N/A', analysableCount: 0 };
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    grade: scale[Math.round(average)] ?? 'N/A',
    analysableCount: values.length,
  };
};

const gradeFromPercentage = (percentage: number, examType: string | null | undefined) => {
  const boundaries =
    examType === 'a-level'
      ? [
          ['A*', 85],
          ['A', 75],
          ['B', 65],
          ['C', 55],
          ['D', 45],
          ['E', 35],
        ]
      : [
          ['9', 85],
          ['8', 78],
          ['7', 70],
          ['6', 60],
          ['5', 50],
          ['4', 40],
          ['3', 30],
          ['2', 20],
          ['1', 10],
        ];

  for (const [grade, boundary] of boundaries) {
    if (percentage >= Number(boundary)) return String(grade);
  }
  return 'U';
};

export type PracticeGradeInput = {
  predicted_grade?: string | null;
  total_marks_awarded?: number | null;
  total_available_marks?: number | null;
};

export const weightedPredictedGrade = (
  attempts: PracticeGradeInput[],
  examType: string | null | undefined
) => {
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
      grade: gradeFromPercentage(percentage, examType),
      analysableCount: markAttempts.length,
    };
  }

  return averagePredictedGrade(attempts.map((attempt) => attempt.predicted_grade), examType);
};
