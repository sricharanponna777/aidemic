import { txt } from '@/lib/ai/text';
import type { PaperQuestion } from '@/types';

/** A paper this long stops being one sitting and starts being a token bill. */
export const MAX_PAPER_QUESTIONS = 20;

const MAX_QUESTION_CHARS = 4000;
const MAX_FIELD_CHARS = 600;

const str = (value: unknown, max: number) => (typeof value === 'string' ? txt(value, max) : '');

const strList = (value: unknown, max: number, cap: number) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, cap).map((item) => txt(item, max))
    : [];

/**
 * Normalise questions posted by the generator page into the shape a printed
 * paper stores.
 *
 * `plot` and `diagram` questions are dropped rather than rejected. Both are
 * marked by deterministic server code (`markPlotAnswer` / `markDiagramAnswer`)
 * against structured coordinates and node labels, which a photograph of
 * handwriting cannot produce -- so a printed paper containing one would have a
 * question that can never be marked. Paper mode asks the generator for neither
 * (`allowPlot: false, allowDiagram: false`), making this the belt to that
 * braces: a model that returns one anyway must not reach the sheet.
 */
export function coercePaperQuestions(raw: unknown): PaperQuestion[] {
  if (!Array.isArray(raw)) return [];

  const questions: PaperQuestion[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;

    const questionType = record.questionType === 'mcq' ? 'mcq' : record.questionType === 'open' ? 'open' : '';
    if (!questionType) continue;

    const question = str(record.question, MAX_QUESTION_CHARS);
    if (!question) continue;

    const rawMarks = typeof record.marks === 'number' ? record.marks : Number(record.marks);
    const marks = Number.isFinite(rawMarks) ? Math.max(1, Math.min(30, Math.round(rawMarks))) : 1;

    const options = questionType === 'mcq' ? strList(record.options, MAX_FIELD_CHARS, 4) : [];
    const rawCorrect = str(record.correctOption, 1).toUpperCase();
    const correctOption =
      questionType === 'mcq' && (rawCorrect === 'A' || rawCorrect === 'B' || rawCorrect === 'C' || rawCorrect === 'D')
        ? rawCorrect
        : '';

    // An MCQ with no options to print, or no key to mark against, is unusable.
    if (questionType === 'mcq' && (options.length < 2 || !correctOption)) continue;

    questions.push({
      questionType,
      question,
      marks: questionType === 'mcq' ? 1 : marks,
      commandWord: str(record.commandWord, 60),
      isCalculation: record.isCalculation === true,
      options,
      correctOption,
      markScheme: strList(record.markScheme, MAX_FIELD_CHARS, 12),
      modelAnswer: str(record.modelAnswer, MAX_FIELD_CHARS),
      skillsAssessed: strList(record.skillsAssessed, 120, 8),
      sourceTitle: str(record.sourceTitle, 200),
      sourceUrl: str(record.sourceUrl, 500),
    });

    if (questions.length >= MAX_PAPER_QUESTIONS) break;
  }

  return questions;
}
