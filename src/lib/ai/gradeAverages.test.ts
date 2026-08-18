import { describe, expect, it } from 'vitest';
import { averagePredictedGrade, normalisePredictedGrade, weightedPredictedGrade } from './gradeAverages';

describe('normalisePredictedGrade', () => {
  it('trims and upper-cases', () => {
    expect(normalisePredictedGrade('  a* ')).toBe('A*');
    expect(normalisePredictedGrade(null)).toBe('');
  });
});

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
