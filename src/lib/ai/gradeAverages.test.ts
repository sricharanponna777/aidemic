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
