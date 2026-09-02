import { describe, expect, it } from 'vitest';
import { coercePaperQuestions, MAX_PAPER_QUESTIONS } from './paperQuestions';

const open = {
  questionType: 'open',
  question: 'Describe one advantage of a series circuit.',
  marks: 3,
  commandWord: 'Describe',
  markScheme: ['Point (1)'],
  modelAnswer: 'model',
};

const mcq = {
  questionType: 'mcq',
  question: 'Which unit measures current?',
  marks: 1,
  options: ['Volt', 'Amp', 'Ohm', 'Watt'],
  correctOption: 'b',
};

describe('coercePaperQuestions', () => {
  it('keeps open and MCQ questions', () => {
    const questions = coercePaperQuestions([open, mcq]);

    expect(questions.map((question) => question.questionType)).toEqual(['open', 'mcq']);
    expect(questions[1].correctOption).toBe('B');
  });

  it('drops plot and diagram questions, which a photograph cannot answer', () => {
    const questions = coercePaperQuestions([
      open,
      { ...open, questionType: 'plot' },
      { ...open, questionType: 'diagram' },
    ]);

    expect(questions).toHaveLength(1);
  });

  it('drops an MCQ with no usable options or no key', () => {
    expect(coercePaperQuestions([{ ...mcq, options: ['only one'] }])).toHaveLength(0);
    expect(coercePaperQuestions([{ ...mcq, correctOption: '' }])).toHaveLength(0);
  });

  it('drops a question with no text', () => {
    expect(coercePaperQuestions([{ ...open, question: '   ' }])).toHaveLength(0);
  });

  it('clamps marks and forces an MCQ to one mark', () => {
    const questions = coercePaperQuestions([{ ...open, marks: 900 }, { ...mcq, marks: 7 }]);

    expect(questions[0].marks).toBe(30);
    expect(questions[1].marks).toBe(1);
  });

  it('defaults an unusable mark value to 1 rather than NaN', () => {
    expect(coercePaperQuestions([{ ...open, marks: 'lots' }])[0].marks).toBe(1);
  });

  it('caps the paper length', () => {
    const questions = coercePaperQuestions(Array.from({ length: 40 }, () => open));

    expect(questions).toHaveLength(MAX_PAPER_QUESTIONS);
  });

  it('survives malformed input', () => {
    expect(coercePaperQuestions(null)).toEqual([]);
    expect(coercePaperQuestions([null, 3, 'x', {}])).toEqual([]);
  });
});
