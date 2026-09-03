import { describe, expect, it } from 'vitest';
import { verifyQuestions } from './verifyQuestions';
import type { ExamQuestion } from '@/app/api/ai/generate-questions/route';

const question = (overrides: Partial<ExamQuestion> = {}): ExamQuestion => ({
  questionType: 'open',
  question: 'Explain why the reaction speeds up.',
  marks: 3,
  commandWord: 'Explain',
  isCalculation: false,
  options: [],
  correctOption: '',
  markScheme: ['Particles gain kinetic energy'],
  modelAnswer: '',
  skillsAssessed: [],
  sourceTitle: '',
  sourceUrl: '',
  plotSpec: null,
  diagramSpec: null,
  diagramTemplate: null,
  ...overrides,
});

describe('verifyQuestions', () => {
  it('passes a well-formed open question', () => {
    expect(verifyQuestions([question()])).toEqual([]);
  });

  it('rejects an assignment with no questions', () => {
    expect(verifyQuestions([])).toHaveLength(1);
  });

  it('flags a blank question and non-positive marks', () => {
    const problems = verifyQuestions([question({ question: '  ', marks: 0 })]);
    expect(problems).toHaveLength(2);
    expect(problems.every((p) => p.questionIndex === 0)).toBe(true);
  });

  it('requires a mark scheme on open questions only', () => {
    expect(verifyQuestions([question({ markScheme: [] })])).toHaveLength(1);
    expect(verifyQuestions([question({ markScheme: ['   '] })])).toHaveLength(1);
    // Plot and diagram answers are marked against their spec, not a written scheme.
    expect(verifyQuestions([question({ questionType: 'plot', markScheme: [] })])).toEqual([]);
    expect(verifyQuestions([question({ questionType: 'diagram', markScheme: [] })])).toEqual([]);
  });

  it('requires an mcq to have two options and a correct one that is filled in', () => {
    const noCorrect = verifyQuestions([question({ questionType: 'mcq', options: ['4', '8', '', ''], correctOption: '' })]);
    expect(noCorrect).toEqual([{ questionIndex: 0, message: 'Choose which option is correct.' }]);

    const tooFew = verifyQuestions([question({ questionType: 'mcq', options: ['4', '', '', ''], correctOption: 'A' })]);
    expect(tooFew).toHaveLength(1);

    const pointsAtBlank = verifyQuestions([question({ questionType: 'mcq', options: ['4', '8', '', ''], correctOption: 'C' })]);
    expect(pointsAtBlank).toEqual([{ questionIndex: 0, message: 'Option C is marked correct but is blank.' }]);
  });

  it('reports the index of every offending question', () => {
    const problems = verifyQuestions([question(), question({ question: '' }), question({ marks: 1.5 })]);
    expect(problems.map((p) => p.questionIndex)).toEqual([1, 2]);
  });
});
