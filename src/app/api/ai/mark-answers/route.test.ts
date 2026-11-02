import { describe, expect, it, vi } from 'vitest';
import { findSkippedQuestions, indexMarkedAnswers, mergeMarkingReports } from './route';

// The route imports server-only modules at load time; none of them are touched
// by the pure helper under test.
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn(), tryCreateAdminClient: vi.fn() }));

type Q = Parameters<typeof indexMarkedAnswers>[1][number];
type A = Parameters<typeof indexMarkedAnswers>[0][number];

const question = (questionType: Q['questionType']): Q =>
  ({ questionType, question: '', marks: 2, commandWord: '', isCalculation: false, options: [], correctOption: '',
     markScheme: [], modelAnswer: '', skillsAssessed: [], sourceTitle: '', sourceUrl: '',
     plotSpec: null, diagramSpec: null, diagramTemplate: null }) as Q;

const answer = (questionIndex: number, marksAwarded: number): A =>
  ({ questionIndex, marksAwarded, maxMarks: 2, band: '', feedback: '', strengths: [], improvements: [],
     weaknessTags: [], exemplarAnswer: '' }) as A;

// MCQ, plot and diagram questions are marked by code and stripped from the
// prompt, so the model sees indices with gaps in them.
const QUESTIONS = [question('mcq'), question('open'), question('mcq'), question('open')];

describe('indexMarkedAnswers', () => {
  it('uses the returned indices when they are the ones that were sent', () => {
    const map = indexMarkedAnswers([answer(1, 2), answer(3, 0)], QUESTIONS);

    expect(map.get(1)?.marksAwarded).toBe(2);
    expect(map.get(3)?.marksAwarded).toBe(0);
    expect(map.has(0)).toBe(false);
  });

  it('remaps positionally when the model renumbered from zero', () => {
    // The model returned 0 and 1 for what were questions 1 and 3. Trusting those
    // indices would mark the second written answer against an MCQ.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = indexMarkedAnswers([answer(0, 2), answer(1, 0)], QUESTIONS);

    expect(map.get(1)?.marksAwarded).toBe(2);
    expect(map.get(3)?.marksAwarded).toBe(0);
    expect(map.has(0)).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('drops a surplus entry rather than mapping it onto a server-marked question', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = indexMarkedAnswers([answer(0, 2), answer(1, 1), answer(2, 2)], QUESTIONS);

    expect([...map.keys()].sort()).toEqual([1, 3]);
    warn.mockRestore();
  });

  it('returns nothing when the model returned nothing', () => {
    expect(indexMarkedAnswers([], QUESTIONS).size).toBe(0);
  });
});

const report = (markedAnswers: A[]) => ({ markedAnswers, summary: '', weaknessAnalysis: [], gradeBoostAdvice: [] });

describe('findSkippedQuestions', () => {
  it('flags an answered model-marked question with no entry', () => {
    const skipped = findSkippedQuestions(report([answer(1, 2)]), QUESTIONS, ['A', 'written', 'B', 'also written']);
    expect([...skipped]).toEqual([3]);
  });

  it('ignores blank answers and server-marked questions', () => {
    expect(findSkippedQuestions(report([answer(1, 2)]), QUESTIONS, ['', 'written', '', '  ']).size).toBe(0);
  });
});

describe('mergeMarkingReports', () => {
  it('fills only the retried questions and rewrites indices so they are trusted', () => {
    // The retry renumbered its single entry to 0; it must land on question 3.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const merged = mergeMarkingReports(report([answer(1, 2)]), report([answer(0, 1)]), QUESTIONS, new Set([3]));
    warn.mockRestore();

    expect(merged.markedAnswers.map((a) => [a.questionIndex, a.marksAwarded])).toEqual([[1, 2], [3, 1]]);
    expect(findSkippedQuestions(merged, QUESTIONS, ['A', 'x', 'B', 'y']).size).toBe(0);
  });
});
