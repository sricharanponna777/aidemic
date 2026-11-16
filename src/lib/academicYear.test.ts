import { describe, expect, it } from 'vitest';
import { academicYearOptions, academicYearStarting, currentAcademicYear } from './academicYear';

describe('academic years', () => {
  it('formats the second year as two digits', () => {
    expect(academicYearStarting(2026)).toBe('2026/27');
    expect(academicYearStarting(2099)).toBe('2099/00');
  });

  it('rolls over on 1 September', () => {
    expect(currentAcademicYear(new Date(2026, 7, 31))).toBe('2025/26');
    expect(currentAcademicYear(new Date(2026, 8, 1))).toBe('2026/27');
    expect(currentAcademicYear(new Date(2027, 0, 15))).toBe('2026/27');
  });

  it('offers previous, current and next year relative to today', () => {
    expect(academicYearOptions(new Date(2026, 10, 16))).toEqual(['2025/26', '2026/27', '2027/28']);
  });

  it('moves the whole window forward on 1 September', () => {
    expect(academicYearOptions(new Date(2027, 8, 1))).toEqual([
      '2026/27',
      '2027/28',
      '2028/29',
    ]);
  });
});
