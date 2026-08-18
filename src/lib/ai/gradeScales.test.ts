import { describe, expect, it } from 'vitest';
import {
  gradeBoundaryNote,
  gradeFromPercentage,
  gradeScaleOrder,
  nextGradeUp,
  topGrade,
} from './gradeScales';

/**
 * The UK boundaries used to live in three hand-copied tables (gradeEstimate.ts,
 * gradeAverages.ts, mark-answers/route.ts) before they were consolidated here. This
 * reimplements the old table verbatim and asserts the new code agrees with it across a
 * grid, so the consolidation provably did not move a single existing predicted grade.
 */
const legacyEstimateGrade = (
  percentage: number,
  examType: 'gcse' | 'a-level',
  board: 'aqa' | 'edexcel' | 'ocr' | null,
  gcseTier: 'foundation' | 'higher' | null
) => {
  const adjustment = board === 'edexcel' ? -2 : board === 'ocr' ? -1 : 0;
  const boundaries =
    examType === 'a-level'
      ? [['A*', 85], ['A', 75], ['B', 65], ['C', 55], ['D', 45], ['E', 35]]
      : gcseTier === 'foundation'
        ? [['5', 70], ['4', 55], ['3', 40], ['2', 25], ['1', 10]]
        : gcseTier === 'higher'
          ? [['9', 85], ['8', 78], ['7', 70], ['6', 60], ['5', 50], ['4', 40], ['3', 30]]
          : [['9', 85], ['8', 78], ['7', 70], ['6', 60], ['5', 50], ['4', 40], ['3', 30], ['2', 20], ['1', 10]];

  for (const [grade, boundary] of boundaries) {
    if (percentage >= Number(boundary) + adjustment) return String(grade);
  }
  return 'U';
};

describe('gradeFromPercentage — UK regression', () => {
  it('matches the pre-consolidation boundaries across every percentage, tier and board', () => {
    const boards = ['aqa', 'edexcel', 'ocr', null] as const;
    const tiers = ['foundation', 'higher', null] as const;

    for (const examType of ['gcse', 'a-level'] as const) {
      for (const board of boards) {
        for (const tier of tiers) {
          for (let percentage = 0; percentage <= 100; percentage += 1) {
            expect(
              gradeFromPercentage(percentage, examType, tier, board),
              `${examType}/${board}/${tier}/${percentage}%`
            ).toBe(legacyEstimateGrade(percentage, examType, board, tier));
          }
        }
      }
    }
  });

  it('accepts a Title-case spec_tier as well as a lowercase one', () => {
    expect(gradeFromPercentage(72, 'gcse', 'Higher', 'aqa')).toBe('7');
    expect(gradeFromPercentage(72, 'gcse', 'higher', 'aqa')).toBe('7');
    // Foundation caps at 5, so the same percentage lands differently.
    expect(gradeFromPercentage(72, 'gcse', 'Foundation', 'aqa')).toBe('5');
  });

  it('leaves Indian boards unadjusted', () => {
    expect(gradeFromPercentage(91, 'cbse-12', null, 'cbse')).toBe('A1');
    expect(gradeFromPercentage(91, 'cbse-12', null, null)).toBe('A1');
  });
});

describe('gradeFromPercentage — Indian and IB scales', () => {
  it('awards all nine CBSE bands, A1 down to a fail at E', () => {
    expect(gradeFromPercentage(95, 'cbse-10', null, 'cbse')).toBe('A1');
    expect(gradeFromPercentage(91, 'cbse-10', null, 'cbse')).toBe('A1');
    expect(gradeFromPercentage(90, 'cbse-10', null, 'cbse')).toBe('A2');
    expect(gradeFromPercentage(61, 'cbse-12', null, 'cbse')).toBe('B2');
    expect(gradeFromPercentage(41, 'cbse-12', null, 'cbse')).toBe('C2');
    // 33% is the pass mark, which is grade D1. Below it, D2 then E.
    expect(gradeFromPercentage(33, 'cbse-12', null, 'cbse')).toBe('D1');
    expect(gradeFromPercentage(32, 'cbse-12', null, 'cbse')).toBe('D2');
    expect(gradeFromPercentage(21, 'cbse-12', null, 'cbse')).toBe('D2');
    expect(gradeFromPercentage(20, 'cbse-12', null, 'cbse')).toBe('E');
  });

  it('awards ICSE grades 1-8 as passes, with 9 the only fail', () => {
    expect(gradeFromPercentage(90, 'icse', null, 'cisce')).toBe('1');
    expect(gradeFromPercentage(80, 'icse', null, 'cisce')).toBe('2');
    expect(gradeFromPercentage(50, 'icse', null, 'cisce')).toBe('5');
    expect(gradeFromPercentage(40, 'icse', null, 'cisce')).toBe('7');
    expect(gradeFromPercentage(33, 'icse', null, 'cisce')).toBe('8');
    expect(gradeFromPercentage(32, 'icse', null, 'cisce')).toBe('9');
  });

  it('puts the ISC pass two points higher than ICSE', () => {
    expect(gradeFromPercentage(35, 'isc', null, 'cisce')).toBe('8');
    expect(gradeFromPercentage(34, 'isc', null, 'cisce')).toBe('9');
    // The same mark is a pass under ICSE but not under ISC.
    expect(gradeFromPercentage(33, 'icse', null, 'cisce')).toBe('8');
    expect(gradeFromPercentage(33, 'isc', null, 'cisce')).toBe('9');
  });

  it('awards IB grades 1-7 identically at HL and SL', () => {
    expect(gradeFromPercentage(85, 'ib-dp', 'HL', 'ib')).toBe('7');
    expect(gradeFromPercentage(85, 'ib-dp', 'SL', 'ib')).toBe('7');
    expect(gradeFromPercentage(50, 'ib-dp', 'HL', 'ib')).toBe('4');
    expect(gradeFromPercentage(29, 'ib-dp', 'HL', 'ib')).toBe('1');
  });
});

describe('gradeScaleOrder', () => {
  it('returns the untiered ladder so averaging never shifts with tier', () => {
    expect(gradeScaleOrder('gcse')).toEqual(['U', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(gradeScaleOrder('a-level')).toEqual(['U', 'E', 'D', 'C', 'B', 'A', 'A*']);
    expect(gradeScaleOrder('cbse-10')).toEqual(['E', 'D2', 'D1', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1']);
    expect(gradeScaleOrder('icse')).toEqual(['9', '8', '7', '6', '5', '4', '3', '2', '1']);
    expect(gradeScaleOrder('ib-dp')).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  it('falls back to the GCSE ladder for an unknown qualification', () => {
    expect(gradeScaleOrder('btec')).toEqual(['U', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });
});

describe('nextGradeUp and topGrade', () => {
  it('walks the tier-specific ladder for GCSE', () => {
    expect(nextGradeUp('7', 'gcse', 'higher')).toBe('8');
    expect(nextGradeUp('9', 'gcse', 'higher')).toBeNull();
    expect(topGrade('gcse', 'higher')).toBe('9');
    expect(topGrade('gcse', 'foundation')).toBe('5');
    expect(topGrade('gcse', null)).toBe('9');
    expect(topGrade('a-level', null)).toBe('A*');
  });

  it('walks the Indian and IB ladders', () => {
    expect(nextGradeUp('B1', 'cbse-12', null)).toBe('A2');
    expect(nextGradeUp('D2', 'cbse-12', null)).toBe('D1');
    expect(topGrade('cbse-12', null)).toBe('A1');
    // ICSE counts down, so the next grade up is the lower number.
    expect(nextGradeUp('5', 'icse', null)).toBe('4');
    expect(topGrade('icse', null)).toBe('1');
    expect(nextGradeUp('6', 'ib-dp', 'HL')).toBe('7');
    expect(topGrade('ib-dp', 'HL')).toBe('7');
  });

  it('returns null for a grade that is not on the scale', () => {
    expect(nextGradeUp('Z', 'gcse', null)).toBeNull();
  });
});

describe('gradeBoundaryNote', () => {
  it('picks the tier-specific note for GCSE', () => {
    expect(gradeBoundaryNote('gcse', 'foundation')).toContain('Foundation tier is capped at grade 5');
    expect(gradeBoundaryNote('gcse', 'higher')).toContain('Higher tier awards grades 9-3');
    expect(gradeBoundaryNote('gcse', null)).toContain('GCSE 9-1 boundaries');
  });

  it('names the right pass mark for each Indian board', () => {
    expect(gradeBoundaryNote('cbse-10', null)).toContain('33%');
    expect(gradeBoundaryNote('cbse-10', null)).toContain('9-point A1-E scale');
    expect(gradeBoundaryNote('icse', null)).toContain('33%');
    expect(gradeBoundaryNote('isc', null)).toContain('35%');
    expect(gradeBoundaryNote('ib-dp', 'HL')).toContain('IB 1-7');
  });

  /* These bands are read off a practice set that has no negative marking, while three of the
   * four real papers do. The note is the only place a student is told that, so pin it. */
  it('warns that the entrance-exam bands are indicative', () => {
    expect(gradeBoundaryNote('jee-main', null)).toContain('negative marking');
    expect(gradeBoundaryNote('jee-advanced', null)).toContain('negative marking');
    expect(gradeBoundaryNote('neet-ug', null)).toContain('720');
    expect(gradeBoundaryNote('ts-eamcet', null)).toContain('no negative marking');
    expect(gradeBoundaryNote('ap-eapcet', null)).toBe(gradeBoundaryNote('ts-eamcet', null));
  });
});

/* The entrance exams report a percentile or a rank, not a grade, so each "grade" is an
 * outcome band. What matters is that the ladder is ordered worst-first (averagePredictedGrade
 * indexes it) and that the boundaries land on the right side of each published cut-off. */
describe('entrance exam scales', () => {
  it('maps a JEE Main practice percentage onto a percentile band', () => {
    expect(gradeFromPercentage(70, 'jee-main')).toBe('99.5+');
    expect(gradeFromPercentage(60, 'jee-main')).toBe('99+');
    expect(gradeFromPercentage(59, 'jee-main')).toBe('98+');
    expect(gradeFromPercentage(40, 'jee-main')).toBe('95+');
    expect(gradeFromPercentage(30, 'jee-main')).toBe('90+');
    expect(gradeFromPercentage(9, 'jee-main')).toBe('<50');
  });

  it('maps a JEE Advanced practice percentage onto a rank band', () => {
    expect(gradeFromPercentage(78, 'jee-advanced')).toBe('Top 100');
    expect(gradeFromPercentage(64, 'jee-advanced')).toBe('Top 500');
    expect(gradeFromPercentage(33, 'jee-advanced')).toBe('Top 15000');
    expect(gradeFromPercentage(30, 'jee-advanced')).toBe('Qualified');
    expect(gradeFromPercentage(29, 'jee-advanced')).toBe('Not qualified');
  });

  it('reads a NEET band as that percentage of the 720 marks available', () => {
    expect(gradeFromPercentage(97, 'neet-ug')).toBe('700+');
    expect(gradeFromPercentage(90, 'neet-ug')).toBe('650+');
    expect(gradeFromPercentage(62, 'neet-ug')).toBe('450+');
    expect(gradeFromPercentage(35, 'neet-ug')).toBe('250+');
    expect(gradeFromPercentage(34, 'neet-ug')).toBe('<250');
  });

  it('shares one rank ladder between the two EAMCET states', () => {
    expect(gradeFromPercentage(87, 'ts-eamcet')).toBe('Top 1000');
    expect(gradeFromPercentage(87, 'ap-eapcet')).toBe('Top 1000');
    expect(gradeFromPercentage(25, 'ts-eamcet')).toBe('Qualified');
    expect(gradeFromPercentage(24, 'ts-eamcet')).toBe('Not qualified');
    expect(gradeScaleOrder('ap-eapcet')).toEqual(gradeScaleOrder('ts-eamcet'));
  });

  it('orders every entrance ladder worst-first, with the fail band at index 0', () => {
    expect(gradeScaleOrder('jee-main')).toEqual([
      '<50', '50+', '70+', '80+', '90+', '95+', '98+', '99+', '99.5+',
    ]);
    expect(gradeScaleOrder('neet-ug')).toEqual([
      '<250', '250+', '350+', '450+', '550+', '600+', '650+', '700+',
    ]);
    expect(topGrade('jee-main')).toBe('99.5+');
    expect(topGrade('jee-advanced')).toBe('Top 100');
    expect(topGrade('ts-eamcet')).toBe('Top 1000');
    expect(nextGradeUp('90+', 'jee-main')).toBe('95+');
    expect(nextGradeUp('Qualified', 'ts-eamcet')).toBe('Top 50000');
    expect(nextGradeUp('99.5+', 'jee-main')).toBeNull();
  });

  /* BOARD_ADJUSTMENT exists for the harder-marking UK boards. NTA and the state councils
   * must not pick one up by accident, or every entrance band would shift. */
  it('applies no board adjustment to the entrance-exam boards', () => {
    expect(gradeFromPercentage(60, 'jee-main', null, 'nta')).toBe('99+');
    expect(gradeFromPercentage(30, 'jee-advanced', null, 'iit')).toBe('Qualified');
    expect(gradeFromPercentage(25, 'ts-eamcet', null, 'tsche')).toBe('Qualified');
    expect(gradeFromPercentage(25, 'ap-eapcet', null, 'apsche')).toBe('Qualified');
    expect(gradeFromPercentage(80, 'mht-cet', null, 'mahacet')).toBe('99.5+');
    expect(gradeFromPercentage(51, 'bitsat', null, 'bits')).toBe('200+');
  });
});

describe('state CET and national entrance scales', () => {
  /* One ladder for four states on purpose: their pools run from about 80,000 (COMEDK) to
   * 500,000 (MHT CET), so a shared *rank* ladder would mean four different things. */
  it('shares one percentile ladder across all four state CETs', () => {
    for (const examType of ['mht-cet', 'keam', 'wbjee', 'comedk']) {
      expect(gradeScaleOrder(examType), examType).toEqual([
        '<50', '50+', '70+', '80+', '90+', '95+', '98+', '99+', '99.5+',
      ]);
      expect(gradeFromPercentage(80, examType), examType).toBe('99.5+');
      expect(gradeFromPercentage(47, examType), examType).toBe('90+');
      expect(gradeFromPercentage(19, examType), examType).toBe('<50');
    }
    expect(gradeBoundaryNote('wbjee', null)).toContain('WBJEE does');
  });

  it('scores CUET per subject on its own percentile ladder', () => {
    expect(gradeFromPercentage(92, 'cuet-ug')).toBe('99.5+');
    expect(gradeFromPercentage(60, 'cuet-ug')).toBe('90+');
    expect(gradeFromPercentage(29, 'cuet-ug')).toBe('<50');
    expect(gradeBoundaryNote('cuet-ug', null)).toContain('not an overall result');
  });

  it('reads a BITSAT band as that percentage of the 390 marks available', () => {
    expect(gradeFromPercentage(95, 'bitsat')).toBe('370+');
    expect(gradeFromPercentage(82, 'bitsat')).toBe('320+');
    expect(gradeFromPercentage(50, 'bitsat')).toBe('<200');
    expect(topGrade('bitsat')).toBe('370+');
  });

  it('shares one rank ladder between VITEEE and SRMJEEE', () => {
    expect(gradeScaleOrder('viteee')).toEqual(gradeScaleOrder('srmjeee'));
    expect(gradeFromPercentage(90, 'viteee')).toBe('Top 500');
    expect(gradeFromPercentage(42, 'srmjeee')).toBe('Top 50000');
    expect(gradeFromPercentage(41, 'srmjeee')).toBe('Below 50000');
  });

  it('gives CLAT, NDA and IPMAT their own ladders', () => {
    expect(gradeFromPercentage(77, 'clat')).toBe('Top 100');
    expect(gradeFromPercentage(36, 'clat')).toBe('Below 20000');
    // The NDA written cut-off sits near 360/900, so 40% is the qualifying band.
    expect(gradeFromPercentage(40, 'nda')).toBe('360+');
    expect(gradeFromPercentage(39, 'nda')).toBe('300+');
    expect(gradeBoundaryNote('nda', null)).toContain('SSB interview');
    expect(gradeFromPercentage(85, 'ipmat')).toBe('Top 50');
    expect(gradeFromPercentage(42, 'ipmat')).toBe('Below 5000');
  });

  it('orders every new ladder worst-first, with the fail band at index 0', () => {
    const fails: Record<string, string> = {
      'mht-cet': '<50', 'cuet-ug': '<50', bitsat: '<200', viteee: 'Below 50000',
      srmjeee: 'Below 50000', clat: 'Below 20000', nda: '<300', ipmat: 'Below 5000',
    };
    for (const [examType, fail] of Object.entries(fails)) {
      expect(gradeScaleOrder(examType)[0], examType).toBe(fail);
      expect(gradeFromPercentage(0, examType), examType).toBe(fail);
      expect(nextGradeUp(topGrade(examType), examType), examType).toBeNull();
    }
  });
});
