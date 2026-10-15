import { describe, expect, it } from 'vitest';
import { PREDICTED_GRADE_WINDOW, averagePredictedGrade, weightedPredictedGrade } from './gradeAverages';

describe('averagePredictedGrade', () => {
  it('returns N/A when nothing is analysable', () => {
    expect(averagePredictedGrade([], 'gcse').grade).toBe('N/A');
    expect(averagePredictedGrade(['Z', null], 'gcse').grade).toBe('N/A');
  });

  it('averages GCSE numeric grades', () => {
    const result = averagePredictedGrade(['6', '8'], 'gcse');
    expect(result.grade).toBe('7');
    expect(result.analysableCount).toBe(2);
  });

  it('averages A-Level letter grades', () => {
    // C(index3) and A(index5) -> average 4 -> B
    expect(averagePredictedGrade(['C', 'A'], 'a-level').grade).toBe('B');
  });

  it('averages on the untiered ladder regardless of tier', () => {
    // The Higher-tier ladder starts at 3, so if it were used here the indices would
    // shift and '6','8' would no longer average to '7'.
    expect(averagePredictedGrade(['6', '8'], 'gcse').grade).toBe('7');
  });

  it('averages CBSE letter bands and ICSE numeric grades', () => {
    // C1(index3) and A2(index6) -> average 4.5 -> rounds to index 5 -> B1
    expect(averagePredictedGrade(['C1', 'A2'], 'cbse-12').grade).toBe('B1');
    // ICSE counts down: '6'(index3) and '4'(index5) -> average 4 -> '5'
    expect(averagePredictedGrade(['6', '4'], 'icse').grade).toBe('5');
    expect(averagePredictedGrade(['5', '7'], 'ib-dp').grade).toBe('6');
  });
});

describe('weightedPredictedGrade', () => {
  it('uses mark totals when available (percentage-based)', () => {
    const result = weightedPredictedGrade(
      [{ total_marks_awarded: 8, total_available_marks: 10 }],
      'a-level'
    );
    expect(result.percentage).toBe(80);
    expect(result.grade).toBe('A'); // 80% on A-Level default boundaries
    expect(result.totalAvailableMarks).toBe(10);
  });

  it('falls back to grade average when no marks present', () => {
    const result = weightedPredictedGrade(
      [{ predicted_grade: '5' }, { predicted_grade: '7' }],
      'gcse'
    );
    expect(result.grade).toBe('6');
    expect(result.percentage).toBeNull();
  });
});

describe('averagePredictedGrade on mixed-case ladders', () => {
  // The entrance exams report an outcome band rather than a grade, and those
  // labels are words. Upper-casing the input before an exact indexOf meant none
  // of them ever matched their own ladder, so every one of these fell through to
  // 'N/A' with analysableCount 0.
  it('averages JEE Advanced rank bands', () => {
    const result = averagePredictedGrade(['Top 4000', 'Top 8000'], 'jee-advanced');
    expect(result.grade).toBe('Top 4000');
    expect(result.analysableCount).toBe(2);
  });

  it('averages CLAT bands and tolerates the casing a caller happens to send', () => {
    const result = averagePredictedGrade(['top 1000', 'TOP 1000'], 'clat');
    expect(result.analysableCount).toBe(2);
    expect(result.grade).toBe('Top 1000');
  });

  it('still returns N/A for a grade that is genuinely not on the ladder', () => {
    expect(averagePredictedGrade(['Top 7'], 'jee-advanced').grade).toBe('N/A');
    expect(averagePredictedGrade([null, ''], 'jee-advanced').analysableCount).toBe(0);
  });

  it('leaves the uppercase ladders working exactly as before', () => {
    expect(averagePredictedGrade(['A*', 'A'], 'a-level').analysableCount).toBe(2);
    expect(averagePredictedGrade(['7', '9'], 'gcse').analysableCount).toBe(2);
  });
});

describe('weightedPredictedGrade attempt window', () => {
  const attempt = (marks: number, created_at: string) => ({
    total_marks_awarded: marks,
    total_available_marks: 10,
    created_at,
  });

  // Sixty consecutive days, oldest first. The ten oldest scored zero; the
  // newest fifty -- the whole window -- scored full marks.
  const dayAfter = (index: number) =>
    new Date(Date.UTC(2026, 0, 1) + index * 24 * 60 * 60 * 1000).toISOString();
  const sixtyAttempts = Array.from({ length: 60 }, (_unused, index) =>
    attempt(index < 10 ? 0 : 10, dayAfter(index))
  );

  it('pools only the newest attempts', () => {
    const result = weightedPredictedGrade(sixtyAttempts, 'gcse');
    expect(result.analysableCount).toBe(PREDICTED_GRADE_WINDOW);
    // The ten ancient zeroes are outside the window, so 100%, not 83%.
    expect(result.percentage).toBe(100);
  });

  it('picks the same window whichever order the caller fetched in', () => {
    // The parent progress page fetches ascending; everyone else descending.
    // Those used to be different windows, so the same student and subject
    // showed different predicted grades on different pages.
    const ascending = weightedPredictedGrade(sixtyAttempts, 'gcse');
    const descending = weightedPredictedGrade([...sixtyAttempts].reverse(), 'gcse');
    expect(descending.grade).toBe(ascending.grade);
    expect(descending.percentage).toBe(ascending.percentage);
  });

  it('leaves a group smaller than the window untouched', () => {
    const three = sixtyAttempts.slice(0, 3);
    expect(weightedPredictedGrade(three, 'gcse').analysableCount).toBe(3);
  });

  it('excludes blurt attempts but keeps rows with no mode recorded', () => {
    const rows = [
      { ...attempt(10, '2026-02-01T00:00:00.000Z'), attempt_mode: 'practice' },
      { ...attempt(0, '2026-02-02T00:00:00.000Z'), attempt_mode: 'blurt' },
      attempt(10, '2026-02-03T00:00:00.000Z'),
    ];
    const result = weightedPredictedGrade(rows, 'gcse');
    expect(result.analysableCount).toBe(2);
    expect(result.percentage).toBe(100);
  });
});
