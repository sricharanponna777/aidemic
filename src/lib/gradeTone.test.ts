import { describe, expect, it } from 'vitest';
import { gradeBadgeTone } from './gradeTone';

const tone = (badge: string) =>
  badge.startsWith('bg-red') ? 'red'
  : badge.startsWith('bg-amber') ? 'amber'
  : badge.startsWith('bg-emerald') ? 'green'
  : 'neutral';

const toneFor = (grade: string, examType?: string | null, specTier?: string | null) =>
  tone(gradeBadgeTone({ grade, examType, specTier }));

/* The GCSE and A-Level bands are hand-written and predate every other scale. A ladder-position
 * rule cannot reproduce both (GCSE breaks after index 3 of 10, A-Level after index 2 of 7), so
 * they keep their own branch. This pins that the ladder path did not disturb them. */
describe('gradeBadgeTone — UK scales are unchanged', () => {
  it('keeps the GCSE bands', () => {
    expect(toneFor('U', 'gcse')).toBe('red');
    expect(['1', '2', '3'].map((g) => toneFor(g, 'gcse'))).toEqual(['red', 'red', 'red']);
    expect(['4', '5', '6'].map((g) => toneFor(g, 'gcse'))).toEqual(['amber', 'amber', 'amber']);
    expect(['7', '8', '9'].map((g) => toneFor(g, 'gcse'))).toEqual(['green', 'green', 'green']);
  });

  it('keeps the Foundation-tier bands, which cap at grade 5', () => {
    expect(toneFor('2', 'gcse', 'Foundation')).toBe('red');
    expect(toneFor('3', 'gcse', 'Foundation')).toBe('amber');
    expect(toneFor('5', 'gcse', 'Foundation')).toBe('green');
  });

  it('keeps the A-Level bands', () => {
    expect(['U', 'E'].map((g) => toneFor(g, 'a-level'))).toEqual(['red', 'red']);
    expect(['D', 'C'].map((g) => toneFor(g, 'a-level'))).toEqual(['amber', 'amber']);
    expect(['B', 'A', 'A*'].map((g) => toneFor(g, 'a-level'))).toEqual(['green', 'green', 'green']);
  });

  it('still falls back to the GCSE branch when no exam type is known', () => {
    expect(toneFor('3', null)).toBe('red');
    expect(toneFor('8', undefined)).toBe('green');
  });
});

describe('gradeBadgeTone — every other scale reads its own ladder', () => {
  /* Before this, numericGrade() rejected 'D2' and the A-Level letter branch then returned
   * green for it, so a near-fail CBSE grade rendered as a pass. */
  it('no longer paints a failing CBSE grade green', () => {
    expect(['E', 'D2', 'D1'].map((g) => toneFor(g, 'cbse-10'))).toEqual(['red', 'red', 'red']);
    expect(['C2', 'C1', 'B2'].map((g) => toneFor(g, 'cbse-10'))).toEqual(['amber', 'amber', 'amber']);
    expect(['B1', 'A2', 'A1'].map((g) => toneFor(g, 'cbse-12'))).toEqual(['green', 'green', 'green']);
  });

  /* ICSE counts down — 1 is the best grade, 9 is the fail — so the GCSE numeric branch had it
   * exactly backwards and painted the top grade red. */
  it('reads the ICSE and ISC ladders in the right direction', () => {
    expect(toneFor('1', 'icse')).toBe('green');
    expect(toneFor('9', 'icse')).toBe('red');
    expect(toneFor('1', 'isc')).toBe('green');
    expect(toneFor('9', 'isc')).toBe('red');
  });

  it('puts the IB pass at 4 in the middle band', () => {
    expect(toneFor('1', 'ib-dp')).toBe('red');
    expect(toneFor('4', 'ib-dp')).toBe('amber');
    expect(toneFor('7', 'ib-dp')).toBe('green');
  });

  it('tones the entrance-exam outcome bands', () => {
    expect(toneFor('<50', 'jee-main')).toBe('red');
    expect(toneFor('90+', 'jee-main')).toBe('amber');
    expect(toneFor('99.5+', 'jee-main')).toBe('green');
    expect(toneFor('Not qualified', 'jee-advanced')).toBe('red');
    expect(toneFor('Top 100', 'jee-advanced')).toBe('green');
    expect(toneFor('<250', 'neet-ug')).toBe('red');
    expect(toneFor('700+', 'neet-ug')).toBe('green');
    expect(toneFor('Not qualified', 'ts-eamcet')).toBe('red');
    expect(toneFor('Top 1000', 'ap-eapcet')).toBe('green');
  });

  it('tones the state CET, CUET and non-engineering ladders', () => {
    expect(toneFor('<50', 'mht-cet')).toBe('red');
    expect(toneFor('99.5+', 'wbjee')).toBe('green');
    expect(toneFor('<50', 'cuet-ug')).toBe('red');
    expect(toneFor('99+', 'cuet-ug')).toBe('green');
    expect(toneFor('<200', 'bitsat')).toBe('red');
    expect(toneFor('370+', 'bitsat')).toBe('green');
    expect(toneFor('Below 50000', 'viteee')).toBe('red');
    expect(toneFor('Top 500', 'srmjeee')).toBe('green');
    expect(toneFor('Below 20000', 'clat')).toBe('red');
    expect(toneFor('Top 100', 'clat')).toBe('green');
    expect(toneFor('<300', 'nda')).toBe('red');
    expect(toneFor('600+', 'nda')).toBe('green');
    expect(toneFor('Below 5000', 'ipmat')).toBe('red');
    expect(toneFor('Top 50', 'ipmat')).toBe('green');
  });

  it('stays neutral rather than guessing when the grade is off its ladder', () => {
    expect(toneFor('', 'jee-main')).toBe('neutral');
    expect(toneFor('N/A', 'cbse-10')).toBe('neutral');
    expect(toneFor('99%', 'neet-ug')).toBe('neutral');
  });
});
