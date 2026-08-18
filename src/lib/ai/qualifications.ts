import type { Country } from './countryConfig';

/** Identifies which set of grade boundaries a qualification is marked against.
 * The tables themselves live in gradeScales.ts. */
export type GradeScaleId =
  | 'gcse'
  | 'a-level'
  | 'cbse'
  | 'cisce-icse'
  | 'cisce-isc'
  | 'ib-dp'
  | 'jee-main'
  | 'jee-advanced'
  | 'neet-ug'
  | 'eamcet'
  | 'state-cet'
  | 'cuet'
  | 'bitsat'
  | 'private-univ-entrance'
  | 'clat'
  | 'nda'
  | 'ipmat';

/** Some qualifications split a subject into parallel routes of differing demand.
 * The UK calls it a tier (Foundation/Higher), CBSE calls it a level
 * (Mathematics Standard/Basic), IB calls it Higher/Standard Level. */
export type TierScheme = { readonly label: string; readonly values: readonly string[] };

export type QualificationDef = {
  /** Stable slug. Also the value stored in exam_practice_attempts.exam_type. */
  readonly id: string;
  /** Exact `qualifications.name` in the curriculum tables. The DB lookups in
   * studentSubjects.ts match on this verbatim, so it must not drift. */
  readonly dbName: string;
  readonly label: string;
  /** `qualifications.level` in the DB (KS4, Class 10, ...). */
  readonly level: string;
  readonly country: Country;
  /** Lowercase board slugs, matched case-insensitively against `exam_boards.name`. */
  readonly boards: readonly string[];
  readonly gradeScale: GradeScaleId;
  /** Absent when the qualification has no tier/level split. */
  readonly tier?: TierScheme;
  /** Listed in the picker but not yet seeded in the curriculum tables. */
  readonly comingSoon?: boolean;
};

const UK_BOARDS = ['aqa', 'edexcel', 'ocr'] as const;

export const QUALIFICATIONS = [
  {
    id: 'gcse',
    dbName: 'GCSE',
    label: 'GCSE',
    level: 'KS4',
    country: 'uk',
    boards: UK_BOARDS,
    gradeScale: 'gcse',
    tier: { label: 'Tier', values: ['Foundation', 'Higher'] },
  },
  {
    id: 'a-level',
    dbName: 'A-Level',
    label: 'A-Level',
    level: 'KS5',
    country: 'uk',
    boards: UK_BOARDS,
    gradeScale: 'a-level',
  },
  {
    id: 'cbse-10',
    dbName: 'CBSE Class 10',
    label: 'CBSE Class 10',
    level: 'Class 10',
    country: 'india',
    boards: ['cbse'],
    gradeScale: 'cbse',
    tier: { label: 'Level', values: ['Standard', 'Basic'] },
  },
  {
    id: 'cbse-12',
    dbName: 'CBSE Class 12',
    label: 'CBSE Class 12',
    level: 'Class 12',
    country: 'india',
    boards: ['cbse'],
    gradeScale: 'cbse',
  },
  {
    id: 'icse',
    dbName: 'ICSE (Class 10)',
    label: 'ICSE (Class 10)',
    level: 'Class 10',
    country: 'india',
    boards: ['cisce'],
    gradeScale: 'cisce-icse',
  },
  {
    id: 'isc',
    dbName: 'ISC (Class 12)',
    label: 'ISC (Class 12)',
    level: 'Class 12',
    country: 'india',
    boards: ['cisce'],
    gradeScale: 'cisce-isc',
  },
  {
    id: 'ib-dp',
    dbName: 'IB Diploma Programme',
    label: 'IB Diploma Programme',
    level: 'Class 11-12',
    country: 'india',
    boards: ['ib'],
    gradeScale: 'ib-dp',
    tier: { label: 'Level', values: ['HL', 'SL'] },
  },
  // Competitive entrance exams. They sit alongside the school qualifications rather than
  // replacing them — a Class 12 student typically studies for both. None is tiered: the
  // EAMCET Engineering / Agriculture & Medical streams differ by which subjects a student
  // takes (Mathematics vs Biology), not by parallel routes through the same subject.
  {
    id: 'jee-main',
    dbName: 'JEE Main',
    label: 'JEE Main',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['nta'],
    gradeScale: 'jee-main',
  },
  {
    id: 'jee-advanced',
    dbName: 'JEE Advanced',
    label: 'JEE Advanced',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['iit'],
    gradeScale: 'jee-advanced',
  },
  {
    id: 'neet-ug',
    dbName: 'NEET UG',
    label: 'NEET UG',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['nta'],
    gradeScale: 'neet-ug',
  },
  {
    id: 'ts-eamcet',
    dbName: 'TS EAMCET',
    label: 'TS EAMCET (Telangana)',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['tsche'],
    gradeScale: 'eamcet',
  },
  {
    id: 'ap-eapcet',
    dbName: 'AP EAPCET',
    label: 'AP EAPCET (Andhra Pradesh)',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['apsche'],
    gradeScale: 'eamcet',
  },
  // State engineering CETs. All four examine Class 11-12 PCM/PCB on their own state board's
  // syllabus and report a rank, so they share one percentile ladder — rank alone is not
  // comparable across states with pools from 80k (COMEDK) to 500k (MHT CET).
  {
    id: 'mht-cet',
    dbName: 'MHT CET',
    label: 'MHT CET (Maharashtra)',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['mahacet'],
    gradeScale: 'state-cet',
  },
  {
    id: 'keam',
    dbName: 'KEAM',
    label: 'KEAM (Kerala)',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['cee'],
    gradeScale: 'state-cet',
  },
  {
    id: 'wbjee',
    dbName: 'WBJEE',
    label: 'WBJEE (West Bengal)',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['wbjeeb'],
    gradeScale: 'state-cet',
  },
  {
    id: 'comedk',
    dbName: 'COMEDK UGET',
    label: 'COMEDK UGET (Karnataka)',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['comedk'],
    gradeScale: 'state-cet',
  },
  // National and private-university entrance tests.
  {
    id: 'cuet-ug',
    dbName: 'CUET UG',
    label: 'CUET UG',
    level: 'Entrance (Class 12)',
    country: 'india',
    boards: ['nta'],
    gradeScale: 'cuet',
  },
  {
    id: 'bitsat',
    dbName: 'BITSAT',
    label: 'BITSAT',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['bits'],
    gradeScale: 'bitsat',
  },
  {
    id: 'viteee',
    dbName: 'VITEEE',
    label: 'VITEEE',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['vit'],
    gradeScale: 'private-univ-entrance',
  },
  {
    id: 'srmjeee',
    dbName: 'SRMJEEE',
    label: 'SRMJEEE',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['srm'],
    gradeScale: 'private-univ-entrance',
  },
  // Non-engineering streams. Their papers are mostly not school subjects, which is why
  // subjects.ts carries slugs like 'legal reasoning' and 'verbal ability'.
  {
    id: 'clat',
    dbName: 'CLAT',
    label: 'CLAT (Law)',
    level: 'Entrance (Class 12)',
    country: 'india',
    boards: ['nlu'],
    gradeScale: 'clat',
  },
  {
    id: 'nda',
    dbName: 'NDA',
    label: 'NDA (Defence)',
    level: 'Entrance (Class 12)',
    country: 'india',
    boards: ['upsc'],
    gradeScale: 'nda',
  },
  {
    id: 'ipmat',
    dbName: 'IPMAT',
    label: 'IPMAT (Management)',
    level: 'Entrance (Class 12)',
    country: 'india',
    boards: ['iim'],
    gradeScale: 'ipmat',
  },
  // Not yet seeded. Listed so the picker can show them behind the "coming soon"
  // banner; each maps to its closest existing grade scale so the type resolves.
  { id: 'ap', dbName: 'AP', label: 'AP (Advanced Placement)', level: 'HS', country: 'us', boards: [], gradeScale: 'a-level', comingSoon: true },
  { id: 'ib-dp-intl', dbName: 'IB Diploma Programme (International)', label: 'IB Diploma Programme', level: 'Class 11-12', country: 'international', boards: [], gradeScale: 'ib-dp', comingSoon: true },
  { id: 'cambridge-igcse', dbName: 'Cambridge IGCSE', label: 'Cambridge IGCSE', level: 'KS4', country: 'international', boards: [], gradeScale: 'gcse', comingSoon: true },
  { id: 'cambridge-a-level', dbName: 'Cambridge International A-Level', label: 'Cambridge A-Level', level: 'KS5', country: 'international', boards: [], gradeScale: 'a-level', comingSoon: true },
] as const satisfies readonly QualificationDef[];

export type ExamType = (typeof QUALIFICATIONS)[number]['id'];
export type ExamBoard = (typeof QUALIFICATIONS)[number]['boards'][number];

/** The same list widened to the declared shape, so optional fields are readable.
 * `as const` gives each entry an exact type that omits the keys it doesn't set. */
const ALL: readonly QualificationDef[] = QUALIFICATIONS;

/** Qualifications with seeded curriculum data behind them. */
export const LIVE_QUALIFICATIONS = ALL.filter((qual) => !qual.comingSoon);

export const qualificationById = (id?: string | null): QualificationDef | null =>
  ALL.find((qual) => qual.id === id) ?? null;

export const qualificationByDbName = (name?: string | null): QualificationDef | null =>
  ALL.find((qual) => qual.dbName === name) ?? null;

export const getQualifications = (country: Country): readonly QualificationDef[] =>
  ALL.filter((qual) => qual.country === country);

export const getQualificationConfig = (country: Country, id: string): QualificationDef | null =>
  ALL.find((qual) => qual.country === country && qual.id === id) ?? null;

/** Maps an exam_type slug back to the exact `qualifications.name` it was derived from.
 * This value is used as a DB lookup key by resolveSpecificationId, so an unknown slug
 * must fall through unchanged rather than being coerced to a default qualification. */
export const getExamTypeLabel = (type?: string | null) =>
  qualificationById(type)?.dbName ?? (type ?? '');

export const getExamBoardLabel = (board: string) => board.toUpperCase();

/** All board slugs across every live qualification, de-duplicated. */
export const ALL_EXAM_BOARDS: string[] = [
  ...new Set(LIVE_QUALIFICATIONS.flatMap((qual) => [...qual.boards])),
];

/** The tier/level a specification string names, lowercased, or null when the qualification
 * is untiered or the string doesn't name one. Lowercase so it can key the tier tables in
 * gradeScales.ts regardless of whether it came from a spec string or a DB `spec_tier`. */
export const getSpecTier = (specification: string, examType?: string | null): string | null => {
  const values = qualificationById(examType)?.tier?.values;
  if (!values) return null;
  const normalized = specification.toLowerCase();
  const match = values.find((value) => new RegExp(`\\b${value.toLowerCase()}\\b`).test(normalized));
  return match ? match.toLowerCase() : null;
};

export const isUkQualification = (examType?: string | null) =>
  qualificationById(examType)?.country === 'uk';
