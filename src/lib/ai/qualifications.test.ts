import { describe, expect, it } from 'vitest';
import { COUNTRIES } from './countryConfig';
import {
  ALL_EXAM_BOARDS,
  LIVE_QUALIFICATIONS,
  QUALIFICATIONS,
  getExamTypeLabel,
  getQualificationConfig,
  getQualifications,
  getSpecTier,
  isUkQualification,
  qualificationByDbName,
  qualificationById,
} from './qualifications';

describe('the qualification registry', () => {
  it('has unique ids and unique DB names', () => {
    const ids = QUALIFICATIONS.map((qual) => qual.id);
    const dbNames = QUALIFICATIONS.map((qual) => qual.dbName);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(dbNames).size).toBe(dbNames.length);
  });

  it('only uses known countries', () => {
    for (const qual of QUALIFICATIONS) {
      expect(COUNTRIES).toContain(qual.country);
    }
  });

  it('gives every live qualification at least one board', () => {
    for (const qual of LIVE_QUALIFICATIONS) {
      expect(qual.boards.length, qual.id).toBeGreaterThan(0);
    }
  });

  it('collects every live board into ALL_EXAM_BOARDS without duplicates', () => {
    expect(new Set(ALL_EXAM_BOARDS).size).toBe(ALL_EXAM_BOARDS.length);
    expect(ALL_EXAM_BOARDS).toEqual(expect.arrayContaining(['aqa', 'edexcel', 'ocr', 'cbse', 'cisce', 'ib']));
  });
});

describe('getExamTypeLabel', () => {
  /* This is the round-trip that matters: mapStudentSubjectRow turns a qualifications.name
   * into a slug, and resolveSpecificationId turns the slug back into the name to look the
   * row up again. If the two ever disagree, every specification silently fails to resolve. */
  it('returns the exact DB name for every registered slug', () => {
    for (const qual of QUALIFICATIONS) {
      expect(getExamTypeLabel(qual.id)).toBe(qual.dbName);
      expect(qualificationByDbName(qual.dbName)?.id).toBe(qual.id);
    }
  });

  it('preserves the UK slugs, so stored exam_type values keep resolving', () => {
    expect(getExamTypeLabel('gcse')).toBe('GCSE');
    expect(getExamTypeLabel('a-level')).toBe('A-Level');
  });

  it('passes an unknown value straight through instead of defaulting to GCSE', () => {
    expect(getExamTypeLabel('btec')).toBe('btec');
    expect(getExamTypeLabel(null)).toBe('');
  });
});

describe('getQualifications', () => {
  it('scopes to the requested country', () => {
    expect(getQualifications('uk').map((qual) => qual.id)).toEqual(['gcse', 'a-level']);
    expect(getQualifications('india').map((qual) => qual.id)).toEqual([
      'cbse-10',
      'cbse-12',
      'icse',
      'isc',
      'ib-dp',
      'jee-main',
      'jee-advanced',
      'neet-ug',
      'ts-eamcet',
      'ap-eapcet',
      'mht-cet',
      'keam',
      'wbjee',
      'comedk',
      'cuet-ug',
      'bitsat',
      'viteee',
      'srmjeee',
      'clat',
      'nda',
      'ipmat',
    ]);
  });

  it('will not return a qualification from another country', () => {
    expect(getQualificationConfig('uk', 'cbse-10')).toBeNull();
    expect(getQualificationConfig('india', 'cbse-10')?.dbName).toBe('CBSE Class 10');
  });
});

describe('getSpecTier', () => {
  it('reads the UK tier out of a specification string', () => {
    expect(getSpecTier('AQA GCSE Biology - Higher', 'gcse')).toBe('higher');
    expect(getSpecTier('AQA GCSE Biology - Foundation', 'gcse')).toBe('foundation');
    expect(getSpecTier('AQA GCSE Biology', 'gcse')).toBeNull();
  });

  it('reads the CBSE level and the IB level', () => {
    expect(getSpecTier('CBSE Class 10 Mathematics - Standard', 'cbse-10')).toBe('standard');
    expect(getSpecTier('CBSE Class 10 Mathematics - Basic', 'cbse-10')).toBe('basic');
    expect(getSpecTier('IB DP Physics - HL', 'ib-dp')).toBe('hl');
    expect(getSpecTier('IB DP Physics - SL', 'ib-dp')).toBe('sl');
  });

  it('returns null for an untiered qualification even when the word appears', () => {
    expect(getSpecTier('ISC Higher Mathematics', 'isc')).toBeNull();
    expect(getSpecTier('AQA A-Level Biology', 'a-level')).toBeNull();
  });
});

describe('isUkQualification', () => {
  it('separates UK qualifications from the rest', () => {
    expect(isUkQualification('gcse')).toBe(true);
    expect(isUkQualification('a-level')).toBe(true);
    expect(isUkQualification('icse')).toBe(false);
    expect(isUkQualification('ib-dp')).toBe(false);
    expect(isUkQualification(undefined)).toBe(false);
  });
});

describe('qualificationById', () => {
  it('returns null rather than throwing for unknown input', () => {
    expect(qualificationById('nope')).toBeNull();
    expect(qualificationById(undefined)).toBeNull();
  });
});
