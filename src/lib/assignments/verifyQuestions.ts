import type { ExamQuestion } from '@/app/api/ai/generate-questions/route';

export type QuestionProblem = { questionIndex: number; message: string };

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

/**
 * The gate a draft assignment must pass before it can be published. Publishing
 * is one-way and freezes the row, so a question that cannot be marked -- no
 * mark scheme, an MCQ whose correct option points at a blank -- has to be
 * caught here rather than by a student halfway through the paper.
 *
 * Plot and diagram questions are marked deterministically against their spec,
 * so they are the one type not required to carry a written mark scheme.
 */
export function verifyQuestions(questions: ExamQuestion[]): QuestionProblem[] {
  const problems: QuestionProblem[] = [];

  if (questions.length === 0) {
    return [{ questionIndex: -1, message: 'This assignment has no questions.' }];
  }

  questions.forEach((question, questionIndex) => {
    const add = (message: string) => problems.push({ questionIndex, message });

    if (!question.question?.trim()) add('The question is blank.');
    if (!Number.isInteger(question.marks) || question.marks < 1) add('Marks must be a whole number of at least 1.');

    if (question.questionType === 'mcq') {
      const filled = question.options.filter((option) => option.trim());
      if (filled.length < 2) add('A multiple-choice question needs at least two options.');

      const correctIndex = OPTION_LETTERS.indexOf(question.correctOption as (typeof OPTION_LETTERS)[number]);
      if (correctIndex === -1) add('Choose which option is correct.');
      else if (!question.options[correctIndex]?.trim()) add(`Option ${question.correctOption} is marked correct but is blank.`);
    } else if (question.questionType === 'open') {
      if (question.markScheme.filter((point) => point.trim()).length === 0) {
        add('An open question needs at least one mark scheme point, or it cannot be marked.');
      }
    }
  });

  return problems;
}
