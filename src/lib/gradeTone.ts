type ExamType = 'gcse' | 'a-level' | string | null | undefined;

const numericGrade = (grade: string | null | undefined) => {
  const match = (grade ?? '').trim().match(/^[1-9]$/);
  return match ? Number(match[0]) : null;
};

export const gcseTierLabelForGrade = ({
  grade,
  examType,
  specTier,
}: {
  grade: string | null | undefined;
  examType?: ExamType;
  specTier?: string | null;
}) => {
  if (examType !== 'gcse') return specTier ?? null;
  const value = numericGrade(grade);
  if (value !== null && value >= 6) return 'Higher';
  return specTier ?? null;
};

export const gradeBadgeTone = ({
  grade,
  examType,
  specTier,
}: {
  grade: string | null | undefined;
  examType?: ExamType;
  specTier?: string | null;
}) => {
  const normalizedGrade = (grade ?? '').trim().toUpperCase();
  if (!normalizedGrade || normalizedGrade === 'N/A') {
    return 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300';
  }

  const value = numericGrade(normalizedGrade);
  if (value === null) {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300';
  }

  const isFoundationTier = examType === 'gcse' && (specTier ?? '').toLowerCase().includes('foundation');
  if (isFoundationTier) {
    if (value <= 2) return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300';
    if (value === 3) return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300';
  }

  if (value <= 3) return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300';
  if (value <= 6) return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300';
};
