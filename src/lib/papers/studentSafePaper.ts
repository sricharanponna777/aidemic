import type { PaperQuestion, StudentSafePaperQuestion } from '@/types';

/**
 * Student-facing projection of a printed paper's questions.
 *
 * `printed_papers.questions_payload` stores the whole generated question,
 * answer key included -- `markScheme`, `modelAnswer`, `correctOption` and the
 * `skillsAssessed` list that names the very things being tested. The paper page
 * has to render the question text to print it, so the row necessarily travels
 * to the browser; without this projection the mark scheme would sit in the
 * network tab of the page the student prints from, which is worse than the
 * assignment leak `studentSafeSpecs.ts` was written to close (there, at least,
 * a student had to be mid-attempt).
 *
 * Allow-list, not a delete-list: a new answer-bearing field added to the
 * generator later is excluded by default rather than leaking until someone
 * remembers to strip it.
 *
 * The original stays server-side. Marking re-reads `questions_payload` from the
 * database rather than trusting whatever the client posts back.
 */
export function toStudentSafePaperQuestion(question: PaperQuestion): StudentSafePaperQuestion {
  return {
    questionType: question.questionType === 'mcq' ? 'mcq' : 'open',
    question: question.question ?? '',
    marks: Number.isFinite(question.marks) ? question.marks : 0,
    commandWord: question.commandWord ?? '',
    isCalculation: question.isCalculation === true,
    // MCQ options are the question, not the answer -- correctOption is what
    // says which one is right, and it is not carried over.
    options: question.questionType === 'mcq' && Array.isArray(question.options) ? [...question.options] : [],
    sourceTitle: question.sourceTitle ?? '',
    sourceUrl: question.sourceUrl ?? '',
  };
}

export function toStudentSafePaperQuestions(questions: PaperQuestion[]): StudentSafePaperQuestion[] {
  return questions.map(toStudentSafePaperQuestion);
}

/** Total marks available, read off the stored questions rather than the client. */
export function totalPaperMarks(questions: Pick<PaperQuestion, 'marks'>[]): number {
  return questions.reduce((sum, question) => sum + (Number.isFinite(question.marks) ? question.marks : 0), 0);
}
