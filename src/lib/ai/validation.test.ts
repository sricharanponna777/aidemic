import { describe, expect, it } from 'vitest';
import { clampCount, normalizeBoard, normalizeExamType, normalizeSubject } from './validation';

describe('normalizeBoard', () => {
  it('accepts supported boards case/space-insensitively', () => {
    expect(normalizeBoard('AQA')).toBe('aqa');
    expect(normalizeBoard(' Edexcel ')).toBe('edexcel');
    expect(normalizeBoard('OCR')).toBe('ocr');
  });

  it('accepts the Indian boards', () => {
    expect(normalizeBoard('CBSE')).toBe('cbse');
    expect(normalizeBoard('CISCE')).toBe('cisce');
    expect(normalizeBoard('IB')).toBe('ib');
  });

  it('rejects unknown boards', () => {
    expect(normalizeBoard('wjec')).toBeNull();
    expect(normalizeBoard('')).toBeNull();
    expect(normalizeBoard(undefined)).toBeNull();
  });

  it('accepts the entrance-exam conducting bodies', () => {
    expect(normalizeBoard('NTA')).toBe('nta');
    expect(normalizeBoard('IIT')).toBe('iit');
    expect(normalizeBoard('TSCHE')).toBe('tsche');
    expect(normalizeBoard('APSCHE')).toBe('apsche');
    for (const board of ['MAHACET', 'CEE', 'WBJEEB', 'COMEDK', 'BITS', 'VIT', 'SRM', 'NLU', 'UPSC', 'IIM']) {
      expect(normalizeBoard(board), board).toBe(board.toLowerCase());
    }
  });
});

describe('normalizeExamType', () => {
  it('normalises GCSE and A-Level variants', () => {
    expect(normalizeExamType('GCSE')).toBe('gcse');
    expect(normalizeExamType('a-level')).toBe('a-level');
    expect(normalizeExamType('A Level')).toBe('a-level');
    expect(normalizeExamType('alevel')).toBe('a-level');
  });

  it('normalises the Indian qualifications and their common spellings', () => {
    expect(normalizeExamType('cbse-10')).toBe('cbse-10');
    expect(normalizeExamType('CBSE Class 10')).toBe('cbse-10');
    expect(normalizeExamType('CBSE 12')).toBe('cbse-12');
    expect(normalizeExamType('ICSE')).toBe('icse');
    expect(normalizeExamType('ISC')).toBe('isc');
    expect(normalizeExamType('IB')).toBe('ib-dp');
    expect(normalizeExamType('IB Diploma Programme')).toBe('ib-dp');
  });

  it('normalises the entrance exams and their common spellings', () => {
    expect(normalizeExamType('JEE Main')).toBe('jee-main');
    expect(normalizeExamType('jee mains')).toBe('jee-main');
    expect(normalizeExamType('JEE Advanced')).toBe('jee-advanced');
    expect(normalizeExamType('NEET UG')).toBe('neet-ug');
    expect(normalizeExamType('neet')).toBe('neet-ug');
    expect(normalizeExamType('TS EAMCET')).toBe('ts-eamcet');
    expect(normalizeExamType('TG EAPCET')).toBe('ts-eamcet');
    expect(normalizeExamType('AP EAPCET')).toBe('ap-eapcet');
  });

  /* 'EAMCET' on its own names both the Telangana and the Andhra Pradesh test. Guessing one
   * would silently study the student against the wrong rank list, so it is left unmapped. */
  it('refuses to guess a state for a bare EAMCET', () => {
    expect(normalizeExamType('eamcet')).toBeNull();
  });

  it('normalises the state CETs and the national entrance tests', () => {
    expect(normalizeExamType('MHT CET')).toBe('mht-cet');
    expect(normalizeExamType('KEAM')).toBe('keam');
    expect(normalizeExamType('WBJEE')).toBe('wbjee');
    expect(normalizeExamType('CUET UG')).toBe('cuet-ug');
    expect(normalizeExamType('cuet')).toBe('cuet-ug');
    expect(normalizeExamType('BITSAT')).toBe('bitsat');
    expect(normalizeExamType('VITEEE')).toBe('viteee');
    expect(normalizeExamType('SRMJEEE')).toBe('srmjeee');
    expect(normalizeExamType('CLAT')).toBe('clat');
    expect(normalizeExamType('NDA')).toBe('nda');
    expect(normalizeExamType('IPMAT')).toBe('ipmat');
  });

  /* COMEDK is the one new qualification whose DB name does not collapse onto its own slug,
   * and the assignment marking path feeds qualifications.name straight through here. Without
   * the alias every COMEDK assignment would fail to mark. */
  it('maps the COMEDK DB name onto its slug', () => {
    expect(normalizeExamType('COMEDK UGET')).toBe('comedk');
    expect(normalizeExamType('comedk')).toBe('comedk');
  });

  it('rejects unknown types, and qualifications that are not seeded yet', () => {
    expect(normalizeExamType('btec')).toBeNull();
    // Listed in the registry behind a "coming soon" flag, but nothing is seeded for it,
    // so a generation route must not accept it.
    expect(normalizeExamType('ap')).toBeNull();
    expect(normalizeExamType('cambridge-igcse')).toBeNull();
  });
});

describe('normalizeSubject', () => {
  it('accepts supported subjects', () => {
    expect(normalizeSubject('Biology')).toBe('biology');
    expect(normalizeSubject('computer science')).toBe('computer science');
  });

  it('accepts the subjects only Indian boards offer', () => {
    expect(normalizeSubject('Science')).toBe('science');
    expect(normalizeSubject('Social Science')).toBe('social science');
    expect(normalizeSubject('Accountancy')).toBe('accountancy');
    expect(normalizeSubject('Hindi')).toBe('hindi');
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
