import { describe, expect, it } from 'vitest';
import { gradeOptions, nextPaperDate, paperLabel, paperNumbers, type SubjectPaper } from './examPapers';

const FROM = new Date('2026-05-10T09:00:00Z');
const paper = (paperNumber: number, examDate: string | null): SubjectPaper => ({ paperNumber, examDate, session: null });

describe('paperNumbers', () => {
  it('uses the specification count', () => {
    expect(paperNumbers(3)).toEqual([1, 2, 3]);
  });

  it('falls back to a single sitting when the count is unknown', () => {
    expect(paperNumbers(0)).toEqual([1]);
  });

  it('never hides a paper the student already saved', () => {
    expect(paperNumbers(2, [paper(3, '2026-06-01')])).toEqual([1, 2, 3]);
  });
});

describe('paperLabel', () => {
  it('numbers papers only when there is more than one', () => {
    expect(paperLabel(2, 3)).toBe('Paper 2');
    expect(paperLabel(1, 1)).toBe('Exam');
  });
});

describe('nextPaperDate', () => {
  it('is the earliest paper still to come', () => {
    expect(nextPaperDate([paper(2, '2026-06-12'), paper(1, '2026-05-20')], FROM)).toBe('2026-05-20');
  });

  it('moves on to the next paper once one has been sat', () => {
    expect(nextPaperDate([paper(1, '2026-05-01'), paper(2, '2026-06-12')], FROM)).toBe('2026-06-12');
  });

  it('counts a paper sat today as still to come', () => {
    expect(nextPaperDate([paper(1, '2026-05-10')], FROM)).toBe('2026-05-10');
  });

  it('is null when every paper is past or undated', () => {
    expect(nextPaperDate([paper(1, '2026-05-01'), paper(2, null)], FROM)).toBeNull();
  });
});

describe('gradeOptions', () => {
  it('lists the course ladder best first, tier included', () => {
    expect(gradeOptions('gcse')).toEqual(['9', '8', '7', '6', '5', '4', '3', '2', '1', 'U']);
    expect(gradeOptions('gcse', 'Foundation')).toEqual(['5', '4', '3', '2', '1', 'U']);
    expect(gradeOptions('a-level')[0]).toBe('A*');
  });
});
