import { qualificationById } from '@/lib/ai/qualifications';
import { gradeScaleOrder } from '@/lib/ai/gradeScales';

type ExamType = 'gcse' | 'a-level' | string | null | undefined;

const NEUTRAL = 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300';
const RED = 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300';
const AMBER = 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';
const GREEN = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300';

const numericGrade = (grade: string | null | undefined) => {
  const match = (grade ?? '').trim().match(/^[1-9]$/);
  return match ? Number(match[0]) : null;
};

/** Tone from where the grade sits on its own ladder: bottom third red, middle amber, top green.
 * Used for every scale except the two UK ones, whose bands this cannot reproduce — GCSE puts the
 * boundary after index 3 of 10 and A-Level after index 2 of 7, and no single fraction does both.
 * Those keep the hand-written branches below, so their colours are unchanged by this path. */
const ladderTone = (grade: string, examType: ExamType) => {
  const order = gradeScaleOrder(examType);
  const index = order.indexOf(grade);
  if (index < 0) return null;
  const position = index / (order.length - 1);
  if (position < 1 / 3) return RED;
  if (position < 2 / 3) return AMBER;
  return GREEN;
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
    return NEUTRAL;
  }

  // Every scale but the two UK ones is read off its own ladder. The hand-written bands below
  // get a CBSE 'D2' and an ICSE '1' backwards, and have no opinion at all on a JEE percentile
  // band. Matching is case-sensitive here because ladder labels are not all uppercase.
  const scale = qualificationById(examType)?.gradeScale;
  if (scale && scale !== 'gcse' && scale !== 'a-level') {
    return ladderTone((grade ?? '').trim(), examType) ?? NEUTRAL;
  }

  if (normalizedGrade === 'U') {
    return RED;
  }

  const value = numericGrade(normalizedGrade);
  if (value === null) {
    // A-level letter grades: A*, A, B → green; C, D → amber; E → red
    if (normalizedGrade === 'E') return RED;
    if (normalizedGrade === 'C' || normalizedGrade === 'D') return AMBER;
    return GREEN;
  }

  const isFoundationTier = examType === 'gcse' && (specTier ?? '').toLowerCase().includes('foundation');
  if (isFoundationTier) {
    if (value <= 2) return RED;
    if (value === 3) return AMBER;
    return GREEN;
  }

  if (value <= 3) return RED;
  if (value <= 6) return AMBER;
  return GREEN;
};
