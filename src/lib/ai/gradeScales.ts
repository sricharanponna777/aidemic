import { qualificationById, type GradeScaleId } from '@/lib/ai/qualifications';

/** One set of grades: the ordered ladder (worst first) used for averaging and
 * "next grade up", and the percentage boundaries used to award a grade. */
export type ScaleTable = {
  /** Worst → best, including the fail grade at index 0. */
  ordered: readonly string[];
  /** Best-first: grade → minimum percentage. */
  boundaries: ReadonlyArray<readonly [string, number]>;
};

export type GradeScale = {
  id: GradeScaleId;
  /** Used when the qualification is untiered, or the tier is unknown. */
  base: ScaleTable;
  /** Keyed by lowercase tier, as returned by getSpecTier. */
  tiers?: Record<string, ScaleTable>;
  /** Awarded below the lowest boundary. */
  fail: string;
  boundaryNote: string;
  tierBoundaryNotes?: Record<string, string>;
};

const GCSE_UNTIERED: ScaleTable = {
  ordered: ['U', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  boundaries: [['9', 85], ['8', 78], ['7', 70], ['6', 60], ['5', 50], ['4', 40], ['3', 30], ['2', 20], ['1', 10]],
};

const GRADE_SCALES: Record<GradeScaleId, GradeScale> = {
  gcse: {
    id: 'gcse',
    base: GCSE_UNTIERED,
    tiers: {
      foundation: {
        ordered: ['U', '1', '2', '3', '4', '5'],
        boundaries: [['5', 70], ['4', 55], ['3', 40], ['2', 25], ['1', 10]],
      },
      higher: {
        ordered: ['U', '3', '4', '5', '6', '7', '8', '9'],
        boundaries: [['9', 85], ['8', 78], ['7', 70], ['6', 60], ['5', 50], ['4', 40], ['3', 30]],
      },
    },
    fail: 'U',
    boundaryNote:
      'Predicted from this practice set using approximate GCSE 9-1 boundaries. Real grade boundaries vary by paper and exam series.',
    tierBoundaryNotes: {
      foundation:
        'Predicted from this practice set using approximate GCSE Foundation tier boundaries. Foundation tier is capped at grade 5.',
      higher:
        'Predicted from this practice set using approximate GCSE Higher tier boundaries. Higher tier awards grades 9-3; below grade 3 is U.',
    },
  },
  'a-level': {
    id: 'a-level',
    base: {
      ordered: ['U', 'E', 'D', 'C', 'B', 'A', 'A*'],
      boundaries: [['A*', 85], ['A', 75], ['B', 65], ['C', 55], ['D', 45], ['E', 35]],
    },
    fail: 'U',
    boundaryNote:
      'Predicted from this practice set using approximate A-Level boundaries. Real grade boundaries vary by paper and exam series.',
  },
  // CBSE reports a 9-point grade (A1 down to E) alongside the mark. Class 10 grading is
  // officially positional — cut-offs move with the cohort — so these absolute bands are
  // the published indicative ranges, not a reproduction of the awarding process.
  cbse: {
    id: 'cbse',
    base: {
      ordered: ['E', 'D2', 'D1', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'],
      boundaries: [
        ['A1', 91], ['A2', 81], ['B1', 71], ['B2', 61],
        ['C1', 51], ['C2', 41], ['D1', 33], ['D2', 21],
      ],
    },
    fail: 'E',
    boundaryNote:
      'Predicted from this practice set using approximate CBSE grade bands on the 9-point A1-E scale. CBSE Class 10 grading is positional, so real cut-offs move with the cohort. The pass mark is 33%, which is grade D1.',
  },
  // CISCE reports grades 1-9: 1-2 excellent, 3-8 passing achievement levels, 9 a fail.
  'cisce-icse': {
    id: 'cisce-icse',
    base: {
      ordered: ['9', '8', '7', '6', '5', '4', '3', '2', '1'],
      boundaries: [['1', 90], ['2', 80], ['3', 70], ['4', 60], ['5', 50], ['6', 45], ['7', 40], ['8', 33]],
    },
    fail: '9',
    boundaryNote:
      'Predicted from this practice set using approximate ICSE grade bands, where grade 1 is highest, grades 1-8 all pass, and grade 9 is a fail. The pass mark is 33%.',
  },
  'cisce-isc': {
    id: 'cisce-isc',
    base: {
      ordered: ['9', '8', '7', '6', '5', '4', '3', '2', '1'],
      boundaries: [['1', 90], ['2', 80], ['3', 70], ['4', 60], ['5', 50], ['6', 45], ['7', 40], ['8', 35]],
    },
    fail: '9',
    boundaryNote:
      'Predicted from this practice set using approximate ISC grade bands, where grade 1 is highest, grades 1-8 all pass, and grade 9 is a fail. The pass mark is 35%.',
  },
  // HL and SL are graded on the same 1-7 scale; the level changes the depth of the
  // course, not the boundaries, so there is no tier table here.
  'ib-dp': {
    id: 'ib-dp',
    base: {
      ordered: ['1', '2', '3', '4', '5', '6', '7'],
      boundaries: [['7', 80], ['6', 70], ['5', 60], ['4', 50], ['3', 40], ['2', 30]],
    },
    fail: '1',
    boundaryNote:
      'Predicted from this practice set using approximate IB 1-7 boundaries. Real IB boundaries are set per subject and exam session.',
  },
  // The entrance exams below report a percentile or an all-India rank, not a grade, so the
  // "grade" here is an outcome band. The boundaries map percentage scored on this practice
  // set onto the band that percentage of the real paper has historically produced. Two
  // caveats the notes repeat: the bands move every year with the cohort, and JEE/NEET carry
  // negative marking that this practice set does not, so a raw practice percentage flatters.
  'jee-main': {
    id: 'jee-main',
    base: {
      ordered: ['<50', '50+', '70+', '80+', '90+', '95+', '98+', '99+', '99.5+'],
      boundaries: [
        ['99.5+', 70], ['99+', 60], ['98+', 53], ['95+', 40],
        ['90+', 30], ['80+', 23], ['70+', 17], ['50+', 10],
      ],
    },
    fail: '<50',
    boundaryNote:
      'Indicative JEE Main percentile band for this practice set, read off published marks-to-percentile ranges (for example 180/300 lands near the 99th percentile). Percentiles are normalised across sessions and move with the cohort every year, and the real paper has negative marking that this practice set does not.',
  },
  'jee-advanced': {
    id: 'jee-advanced',
    base: {
      ordered: ['Not qualified', 'Qualified', 'Top 15000', 'Top 8000', 'Top 4000', 'Top 1500', 'Top 500', 'Top 100'],
      boundaries: [
        ['Top 100', 78], ['Top 500', 64], ['Top 1500', 54], ['Top 4000', 46],
        ['Top 8000', 39], ['Top 15000', 33], ['Qualified', 30],
      ],
    },
    fail: 'Not qualified',
    boundaryNote:
      'Indicative JEE Advanced all-India rank band for this practice set. The qualifying aggregate sits near 30% and subject-wise minimums apply on top of it, so a passing aggregate alone does not guarantee qualification. The real paper carries negative marking and a partial-marking scheme this practice set does not reproduce.',
  },
  'neet-ug': {
    id: 'neet-ug',
    base: {
      ordered: ['<250', '250+', '350+', '450+', '550+', '600+', '650+', '700+'],
      boundaries: [
        ['700+', 97], ['650+', 90], ['600+', 83], ['550+', 76],
        ['450+', 62], ['350+', 49], ['250+', 35],
      ],
    },
    fail: '<250',
    boundaryNote:
      'Indicative NEET UG score band out of 720 for this practice set — the band is simply that percentage of the 720 marks available. The real paper deducts one mark for each wrong answer, so an unattempted-question strategy scores differently, and the rank a given score earns moves with the cohort each year.',
  },
  eamcet: {
    id: 'eamcet',
    base: {
      ordered: ['Not qualified', 'Qualified', 'Top 50000', 'Top 25000', 'Top 10000', 'Top 5000', 'Top 1000'],
      boundaries: [
        ['Top 1000', 87], ['Top 5000', 75], ['Top 10000', 66],
        ['Top 25000', 56], ['Top 50000', 44], ['Qualified', 25],
      ],
    },
    fail: 'Not qualified',
    boundaryNote:
      'Indicative TS EAMCET / AP EAPCET rank band for this practice set, against the 160-mark paper. Qualification needs 25% for most categories. There is no negative marking, so every question is worth attempting. Ranks also fold in Intermediate board marks for some streams and move with the cohort each year.',
  },
  // MHT CET, KEAM, WBJEE and COMEDK. Deliberately a percentile rather than a rank ladder:
  // their candidate pools run from roughly 80,000 to 500,000, so the same rank means very
  // different things, while a percentile is comparable. MHT CET publishes percentiles
  // directly; for the other three this is a percentile of that state's own pool.
  'state-cet': {
    id: 'state-cet',
    base: {
      ordered: ['<50', '50+', '70+', '80+', '90+', '95+', '98+', '99+', '99.5+'],
      boundaries: [
        ['99.5+', 80], ['99+', 73], ['98+', 68], ['95+', 58],
        ['90+', 47], ['80+', 37], ['70+', 30], ['50+', 20],
      ],
    },
    fail: '<50',
    boundaryNote:
      'Indicative state CET percentile band for this practice set, of that state’s own candidate pool — a rank from one state does not transfer to another. MHT CET, KEAM and COMEDK have no negative marking; WBJEE does. Each board also examines its own state syllabus, so coverage differs slightly from the NCERT units used here.',
  },
  // CUET normalises each subject to a percentile across sessions, so the band is per subject
  // rather than an overall result. The domain papers are strictly NCERT Class 12 and shorter
  // than JEE's, which is why the boundaries sit higher than the jee-main ones.
  cuet: {
    id: 'cuet',
    base: {
      ordered: ['<50', '50+', '70+', '80+', '90+', '95+', '98+', '99+', '99.5+'],
      boundaries: [
        ['99.5+', 92], ['99+', 84], ['98+', 78], ['95+', 68],
        ['90+', 60], ['80+', 50], ['70+', 42], ['50+', 30],
      ],
    },
    fail: '<50',
    boundaryNote:
      'Indicative CUET UG percentile band for this subject, not an overall result — CUET normalises each subject separately across sessions, so your subjects can land in different bands. The real paper deducts a mark for each wrong answer, and university cut-offs are set per programme rather than nationally.',
  },
  // BITSAT is scored out of 390 across Physics, Chemistry, Mathematics, English Proficiency
  // and Logical Reasoning, so each band is that percentage of 390.
  bitsat: {
    id: 'bitsat',
    base: {
      ordered: ['<200', '200+', '250+', '280+', '300+', '320+', '350+', '370+'],
      boundaries: [
        ['370+', 95], ['350+', 90], ['320+', 82], ['300+', 77],
        ['280+', 72], ['250+', 64], ['200+', 51],
      ],
    },
    fail: '<200',
    boundaryNote:
      'Indicative BITSAT score band out of 390 — the band is that percentage of the marks available. Cut-offs are set per campus and branch and move every year; CS at Pilani has recently needed around 320. The real paper has negative marking, and its bonus questions are not modelled here.',
  },
  // VITEEE and SRMJEEE. Both are single-university rank lists of a comparable size, and
  // neither has a qualifying mark — essentially every candidate receives a rank.
  'private-univ-entrance': {
    id: 'private-univ-entrance',
    base: {
      ordered: ['Below 50000', 'Top 50000', 'Top 20000', 'Top 10000', 'Top 5000', 'Top 2000', 'Top 500'],
      boundaries: [
        ['Top 500', 90], ['Top 2000', 82], ['Top 5000', 74],
        ['Top 10000', 66], ['Top 20000', 56], ['Top 50000', 42],
      ],
    },
    fail: 'Below 50000',
    boundaryNote:
      'Indicative VITEEE / SRMJEEE rank band for this practice set. There is no qualifying mark — the rank decides which campus and branch you are offered, and the popular branches at the main campuses need roughly the top 5,000. Neither paper has negative marking.',
  },
  clat: {
    id: 'clat',
    base: {
      ordered: ['Below 20000', 'Top 20000', 'Top 10000', 'Top 5000', 'Top 2000', 'Top 1000', 'Top 500', 'Top 100'],
      boundaries: [
        ['Top 100', 77], ['Top 500', 71], ['Top 1000', 67], ['Top 2000', 62],
        ['Top 5000', 54], ['Top 10000', 46], ['Top 20000', 37],
      ],
    },
    fail: 'Below 20000',
    boundaryNote:
      'Indicative CLAT all-India rank band for this practice set, against the 120-mark paper. The top National Law Universities have recently needed around the top 500, and NLSIU Bangalore roughly the top 100. The real paper is comprehension-led with negative marking, so speed matters as much as accuracy.',
  },
  // The written paper is out of 900 across Mathematics and the General Ability Test. The
  // qualifying mark has recently sat near 360, which is why '360+' is the pass band.
  nda: {
    id: 'nda',
    base: {
      ordered: ['<300', '300+', '360+', '420+', '480+', '540+', '600+'],
      boundaries: [
        ['600+', 67], ['540+', 60], ['480+', 53], ['420+', 47],
        ['360+', 40], ['300+', 33],
      ],
    },
    fail: '<300',
    boundaryNote:
      'Indicative NDA written score band out of 900. The written cut-off has recently sat near 360, so 360+ is the qualifying band — but the written paper is only the first stage, and the final merit list is decided by the SSB interview, which carries a further 900 marks. Both papers have negative marking.',
  },
  ipmat: {
    id: 'ipmat',
    base: {
      ordered: ['Below 5000', 'Top 5000', 'Top 2000', 'Top 1000', 'Top 500', 'Top 200', 'Top 50'],
      boundaries: [
        ['Top 50', 85], ['Top 200', 77], ['Top 500', 70],
        ['Top 1000', 63], ['Top 2000', 55], ['Top 5000', 43],
      ],
    },
    fail: 'Below 5000',
    boundaryNote:
      'Indicative IPMAT rank band for this practice set. The pool is small — roughly 30,000 candidates — so ranks move fast near the top. Sectional cut-offs apply before the overall rank is computed, and IIM Indore weighs the written score against Class 10 and 12 marks and a personal interview in the final call.',
  },
};

/** Exam boards that mark noticeably harder than the reference board. Applied as a
 * percentage offset to every boundary. Only the UK boards carry an adjustment. */
const BOARD_ADJUSTMENT: Record<string, number> = { edexcel: -2, ocr: -1 };

export const gradeScaleFor = (examType?: string | null): GradeScale =>
  GRADE_SCALES[qualificationById(examType)?.gradeScale ?? 'gcse'];

const normalizeTier = (tier?: string | null) => (tier ?? '').toLowerCase().trim();

/** The table for a qualification + tier, falling back to the untiered table. */
export const scaleTableFor = (examType?: string | null, tier?: string | null): ScaleTable => {
  const scale = gradeScaleFor(examType);
  const key = normalizeTier(tier);
  // spec_tier arrives as a full word ('Foundation'), a spec fragment, or the scheme's
  // own short form ('HL'), so match on containment rather than equality.
  const match = Object.keys(scale.tiers ?? {}).find((name) => key.includes(name));
  return (match && scale.tiers?.[match]) || scale.base;
};

/** The grade ladder for averaging. Deliberately always the untiered ladder — the tier
 * ladders are shorter, and swapping them in would move existing averages. */
export const gradeScaleOrder = (examType?: string | null): readonly string[] =>
  gradeScaleFor(examType).base.ordered;

export const gradeFromPercentage = (
  percentage: number,
  examType?: string | null,
  tier?: string | null,
  examBoard?: string | null
): string => {
  const scale = gradeScaleFor(examType);
  const table = scaleTableFor(examType, tier);
  const adjustment = BOARD_ADJUSTMENT[examBoard ?? ''] ?? 0;

  for (const [grade, boundary] of table.boundaries) {
    if (percentage >= boundary + adjustment) return grade;
  }
  return scale.fail;
};

export const nextGradeUp = (grade: string, examType?: string | null, tier?: string | null): string | null => {
  const order = scaleTableFor(examType, tier).ordered;
  const index = order.indexOf(grade);
  if (index < 0 || index >= order.length - 1) return null;
  return order[index + 1];
};

export const topGrade = (examType?: string | null, tier?: string | null): string => {
  const order = scaleTableFor(examType, tier).ordered;
  return order[order.length - 1];
};

export const gradeBoundaryNote = (examType?: string | null, tier?: string | null): string => {
  const scale = gradeScaleFor(examType);
  const key = normalizeTier(tier);
  const match = Object.keys(scale.tierBoundaryNotes ?? {}).find((name) => key.includes(name));
  return (match && scale.tierBoundaryNotes?.[match]) || scale.boundaryNote;
};
