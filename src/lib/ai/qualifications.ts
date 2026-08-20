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

/** Buckets qualifications for the picker so a long, flat list (16 India entrance exams
 * alongside the school boards) reads as grouped headings instead of one continuous list. */
export type QualificationGroup = 'school' | 'engineering' | 'medical' | 'other';

export const QUALIFICATION_GROUP_LABELS: Record<QualificationGroup, string> = {
  school: 'School Boards',
  engineering: 'Engineering Entrance',
  medical: 'Medical Entrance',
  other: 'Other Competitive Exams',
};

/** Order the groups should appear in the picker, regardless of declaration order in
 * QUALIFICATIONS. */
export const QUALIFICATION_GROUP_ORDER: readonly QualificationGroup[] = [
  'school',
  'engineering',
  'medical',
  'other',
];

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
  /** Headings this qualification sits under in the picker. Most have one; a few state CETs
   * (EAMCET/EAPCET, KEAM) examine both an engineering stream and a medical/agriculture one
   * under a single exam, so they appear under both headings. */
  readonly groups: readonly QualificationGroup[];
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
    groups: ['school'],
  },
  {
    id: 'a-level',
    dbName: 'A-Level',
    label: 'A-Level',
    level: 'KS5',
    country: 'uk',
    boards: UK_BOARDS,
    gradeScale: 'a-level',
    groups: ['school'],
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
    groups: ['school'],
  },
  {
    id: 'cbse-12',
    dbName: 'CBSE Class 12',
    label: 'CBSE Class 12',
    level: 'Class 12',
    country: 'india',
    boards: ['cbse'],
    gradeScale: 'cbse',
    groups: ['school'],
  },
  {
    id: 'icse',
    dbName: 'ICSE (Class 10)',
    label: 'ICSE (Class 10)',
    level: 'Class 10',
    country: 'india',
    boards: ['cisce'],
    gradeScale: 'cisce-icse',
    groups: ['school'],
  },
  {
    id: 'isc',
    dbName: 'ISC (Class 12)',
    label: 'ISC (Class 12)',
    level: 'Class 12',
    country: 'india',
    boards: ['cisce'],
    gradeScale: 'cisce-isc',
    groups: ['school'],
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
    groups: ['school'],
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
    groups: ['engineering'],
  },
  {
    id: 'jee-advanced',
    dbName: 'JEE Advanced',
    label: 'JEE Advanced',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['iit'],
    gradeScale: 'jee-advanced',
    groups: ['engineering'],
  },
  {
    id: 'neet-ug',
    dbName: 'NEET UG',
    label: 'NEET UG',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['nta'],
    gradeScale: 'neet-ug',
    groups: ['medical'],
  },
  {
    id: 'ts-eamcet',
    dbName: 'TS EAMCET',
    label: 'TS EAMCET (Telangana)',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['tsche'],
    gradeScale: 'eamcet',
    // Engineering, Agriculture and Medical Common Entrance Test — one exam, two streams.
    groups: ['engineering', 'medical'],
  },
  {
    id: 'ap-eapcet',
    dbName: 'AP EAPCET',
    label: 'AP EAPCET (Andhra Pradesh)',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['apsche'],
    gradeScale: 'eamcet',
    groups: ['engineering', 'medical'],
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
    groups: ['engineering'],
  },
  {
    id: 'keam',
    dbName: 'KEAM',
    label: 'KEAM (Kerala)',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['cee'],
    gradeScale: 'state-cet',
    // Kerala Engineering Architecture Medical — engineering and medical/pharmacy streams
    // under one exam.
    groups: ['engineering', 'medical'],
  },
  {
    id: 'wbjee',
    dbName: 'WBJEE',
    label: 'WBJEE (West Bengal)',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['wbjeeb'],
    gradeScale: 'state-cet',
    groups: ['engineering'],
  },
  {
    id: 'comedk',
    dbName: 'COMEDK UGET',
    label: 'COMEDK UGET (Karnataka)',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['comedk'],
    gradeScale: 'state-cet',
    groups: ['engineering'],
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
    groups: ['other'],
  },
  {
    id: 'bitsat',
    dbName: 'BITSAT',
    label: 'BITSAT',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['bits'],
    gradeScale: 'bitsat',
    groups: ['engineering'],
  },
  {
    id: 'viteee',
    dbName: 'VITEEE',
    label: 'VITEEE',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['vit'],
    gradeScale: 'private-univ-entrance',
    groups: ['engineering'],
  },
  {
    id: 'srmjeee',
    dbName: 'SRMJEEE',
    label: 'SRMJEEE',
    level: 'Entrance (Class 11-12)',
    country: 'india',
    boards: ['srm'],
    gradeScale: 'private-univ-entrance',
    groups: ['engineering'],
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
    groups: ['other'],
  },
  {
    id: 'nda',
    dbName: 'NDA',
    label: 'NDA (Defence)',
    level: 'Entrance (Class 12)',
    country: 'india',
    boards: ['upsc'],
    gradeScale: 'nda',
    groups: ['other'],
  },
  {
    id: 'ipmat',
    dbName: 'IPMAT',
    label: 'IPMAT (Management)',
    level: 'Entrance (Class 12)',
    country: 'india',
    boards: ['iim'],
    gradeScale: 'ipmat',
    groups: ['other'],
  },
  // Not yet seeded. Listed so the picker can show them behind the "coming soon"
  // banner; each maps to its closest existing grade scale so the type resolves.
  { id: 'ap', dbName: 'AP', label: 'AP (Advanced Placement)', level: 'HS', country: 'us', boards: [], gradeScale: 'a-level', comingSoon: true, groups: ['school'] },
  { id: 'ib-dp-intl', dbName: 'IB Diploma Programme (International)', label: 'IB Diploma Programme', level: 'Class 11-12', country: 'international', boards: [], gradeScale: 'ib-dp', comingSoon: true, groups: ['school'] },
  { id: 'cambridge-igcse', dbName: 'Cambridge IGCSE', label: 'Cambridge IGCSE', level: 'KS4', country: 'international', boards: [], gradeScale: 'gcse', comingSoon: true, groups: ['school'] },
  { id: 'cambridge-a-level', dbName: 'Cambridge International A-Level', label: 'Cambridge A-Level', level: 'KS5', country: 'international', boards: [], gradeScale: 'a-level', comingSoon: true, groups: ['school'] },
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

/** Buckets a qualification list under each group heading it belongs to, in
 * QUALIFICATION_GROUP_ORDER, skipping empty groups. A qualification with more than one
 * group (e.g. EAMCET/EAPCET, KEAM) appears under each of its headings. */
export const groupQualifications = (
  quals: readonly QualificationDef[]
): { group: QualificationGroup; label: string; items: readonly QualificationDef[] }[] =>
  QUALIFICATION_GROUP_ORDER.map((group) => ({
    group,
    label: QUALIFICATION_GROUP_LABELS[group],
    items: quals.filter((qual) => qual.groups.includes(group)),
  })).filter((bucket) => bucket.items.length > 0);

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
