import { describe, expect, it } from 'vitest';
import { clampCount, normalizeBoard, normalizeExamType, normalizeSubject } from './validation';

describe('normalizeBoard', () => {
  it('accepts supported boards case/space-insensitively', () => {
    expect(normalizeBoard('AQA')).toBe('aqa');
    expect(normalizeBoard(' Edexcel ')).toBe('edexcel');
    expect(normalizeBoard('OCR')).toBe('ocr');
  });

  it('rejects unknown boards', () => {
    expect(normalizeBoard('wjec')).toBeNull();
    expect(normalizeBoard('')).toBeNull();
    expect(normalizeBoard(undefined)).toBeNull();
  });
});

describe('normalizeExamType', () => {
  it('normalises GCSE and A-Level variants', () => {
    expect(normalizeExamType('GCSE')).toBe('gcse');
    expect(normalizeExamType('a-level')).toBe('a-level');
    expect(normalizeExamType('A Level')).toBe('a-level');
    expect(normalizeExamType('alevel')).toBe('a-level');
  });

  it('rejects unknown types', () => {
    expect(normalizeExamType('btec')).toBeNull();
  });
});

describe('normalizeSubject', () => {
  it('accepts supported subjects', () => {
    expect(normalizeSubject('Biology')).toBe('biology');
    expect(normalizeSubject('computer science')).toBe('computer science');
  });

  it('rejects unsupported subjects', () => {
    expect(normalizeSubject('astrology')).toBeNull();
  });
});

describe('clampCount', () => {
  it('clamps within [min, max]', () => {
    expect(clampCount(5, 1, 10, 6)).toBe(5);
    expect(clampCount(0, 2, 10, 6)).toBe(2);
    expect(clampCount(99, 2, 10, 6)).toBe(10);
  });

  it('falls back for non-finite input and floors decimals', () => {
    expect(clampCount('nope', 2, 10, 6)).toBe(6);
    expect(clampCount(undefined, 2, 10, 6)).toBe(6);
    expect(clampCount(7.9, 2, 10, 6)).toBe(7);
  });
});
