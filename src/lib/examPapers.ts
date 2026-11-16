/**
 * A subject is sat as several papers, each on its own day and in a morning or an
 * afternoon session. Rows live in student_subject_papers, one per paper number.
 */
import { daysUntilExam } from '@/lib/revisionPlanner';
import { scaleTableFor } from '@/lib/ai/gradeScales';

export type ExamSession = 'morning' | 'afternoon';

export type SubjectPaper = {
  paperNumber: number;
  examDate: string | null;
  session: ExamSession | null;
};

export type SubjectPaperRow = {
  student_subject_id: string;
  paper_number: number;
  exam_date: string | null;
  session: ExamSession | null;
};

export const SESSION_LABELS: Record<ExamSession, string> = { morning: 'Morning', afternoon: 'Afternoon' };

/**
 * The paper numbers to ask about: the specification's count when it is known, otherwise
 * one sitting. A paper the student already saved is never hidden, even past that count.
 */
export const paperNumbers = (specPaperCount: number, saved: SubjectPaper[] = []): number[] => {
  const highest = Math.max(specPaperCount, 1, ...saved.map((paper) => paper.paperNumber));
  return Array.from({ length: highest }, (_, index) => index + 1);
};

/** "Paper 2", or plain "Exam" when the subject is a single sitting. */
export const paperLabel = (paperNumber: number, paperCount: number) =>
  paperCount > 1 ? `Paper ${paperNumber}` : 'Exam';

/**
 * The date the planner should count toward: the earliest paper still to come, so once
 * paper 1 is sat the subject moves on to paper 2 rather than dropping out of the plan.
 */
export const nextPaperDate = (papers: SubjectPaper[], from: Date = new Date()): string | null => {
  const upcoming = papers
    .filter((paper) => {
      const days = daysUntilExam(paper.examDate, from);
      return days !== null && days >= 0;
    })
    .map((paper) => paper.examDate as string)
    .sort();
  return upcoming[0] ?? null;
};

/** Grades a student can pick as a target or prediction for this course, best first. */
export const gradeOptions = (examType?: string | null, tier?: string | null): string[] =>
  [...scaleTableFor(examType, tier).ordered].reverse();
