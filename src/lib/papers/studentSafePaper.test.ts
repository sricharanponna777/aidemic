import { describe, expect, it } from 'vitest';
import { toStudentSafePaperQuestion, toStudentSafePaperQuestions, totalPaperMarks } from './studentSafePaper';
import type { PaperQuestion } from '@/types';

const openQuestion: PaperQuestion = {
  questionType: 'open',
  question: 'Explain why sodium chloride has a high melting point.',
  marks: 4,
  commandWord: 'Explain',
  isCalculation: false,
  options: [],
  correctOption: '',
  markScheme: ['Ionic bonding (1)', 'Strong electrostatic forces (1)', 'Lattice structure (1)', 'Much energy to overcome (1)'],
  modelAnswer: 'Sodium chloride is held together by strong electrostatic forces...',
  skillsAssessed: ['Ionic bonding', 'Structure and properties'],
  sourceTitle: 'AQA Chemistry',
  sourceUrl: 'https://example.test/spec',
};

const mcqQuestion: PaperQuestion = {
  questionType: 'mcq',
  question: 'Which particle has no charge?',
  marks: 1,
  commandWord: 'Identify',
  isCalculation: false,
  options: ['Proton', 'Neutron', 'Electron', 'Ion'],
  correctOption: 'B',
  markScheme: ['Neutron (1)'],
  modelAnswer: 'Neutron',
  skillsAssessed: ['Atomic structure'],
  sourceTitle: '',
  sourceUrl: '',
};

describe('toStudentSafePaperQuestion', () => {
  it('drops every answer-bearing field', () => {
    const safe = toStudentSafePaperQuestion(openQuestion) as unknown as Record<string, unknown>;

    expect(safe.markScheme).toBeUndefined();
    expect(safe.modelAnswer).toBeUndefined();
    expect(safe.correctOption).toBeUndefined();
    expect(safe.skillsAssessed).toBeUndefined();
  });

  it('leaks nothing through JSON serialisation', () => {
    // The regression that matters is what reaches the network tab, so assert on
    // the wire format rather than on the object's own keys.
    const wire = JSON.stringify(toStudentSafePaperQuestions([openQuestion, mcqQuestion]));

    expect(wire).not.toContain('Ionic bonding (1)');
    expect(wire).not.toContain('strong electrostatic forces');
    expect(wire).not.toContain('correctOption');
    expect(wire).not.toContain('Neutron (1)');
  });

  it('keeps everything needed to print the question', () => {
    const safe = toStudentSafePaperQuestion(openQuestion);

    expect(safe.question).toBe(openQuestion.question);
    expect(safe.marks).toBe(4);
    expect(safe.commandWord).toBe('Explain');
    expect(safe.sourceTitle).toBe('AQA Chemistry');
  });

  it('keeps MCQ options but not which one is right', () => {
    const safe = toStudentSafePaperQuestion(mcqQuestion);

    expect(safe.options).toEqual(['Proton', 'Neutron', 'Electron', 'Ion']);
    expect(JSON.stringify(safe)).not.toContain('"B"');
  });

  it('does not carry options on an open question', () => {
    const safe = toStudentSafePaperQuestion({ ...openQuestion, options: ['leaked', 'distractor'] });

    expect(safe.options).toEqual([]);
  });

  it('copies the options array rather than aliasing the original', () => {
    const safe = toStudentSafePaperQuestion(mcqQuestion);
    safe.options[0] = 'mutated';

    expect(mcqQuestion.options[0]).toBe('Proton');
  });
});

describe('totalPaperMarks', () => {
  it('sums the mark values', () => {
    expect(totalPaperMarks([openQuestion, mcqQuestion])).toBe(5);
  });

  it('ignores a non-numeric mark value rather than returning NaN', () => {
    expect(totalPaperMarks([openQuestion, { marks: Number.NaN }])).toBe(4);
  });
});
