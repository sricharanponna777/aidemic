import { txt } from '@/lib/ai/text';
import { SUPPORTED_SUBJECTS, type SupportedSubject } from '@/lib/ai/subjects';
import {
  ALL_EXAM_BOARDS,
  LIVE_QUALIFICATIONS,
  getExamBoardLabel,
  type ExamBoard,
  type ExamType,
} from '@/lib/ai/qualifications';

export { SUPPORTED_SUBJECTS };
export type { SupportedSubject };
export type SupportedBoard = ExamBoard;
export type SupportedExamType = ExamType;

/** Only qualifications with seeded curriculum data are accepted by the AI routes —
 * a "coming soon" qualification would pass validation and then find no specification. */
export const SUPPORTED_EXAM_BOARDS = ALL_EXAM_BOARDS as SupportedBoard[];
export const SUPPORTED_EXAM_TYPES = LIVE_QUALIFICATIONS.map((qual) => qual.id) as SupportedExamType[];

/** Human-readable lists for the "must be one of" rejection messages. */
export const SUPPORTED_EXAM_BOARDS_LABEL = SUPPORTED_EXAM_BOARDS.map(getExamBoardLabel).join(', ');
export const SUPPORTED_EXAM_TYPES_LABEL = LIVE_QUALIFICATIONS.map((qual) => qual.label).join(', ');

/** Strips case, whitespace and punctuation so 'A Level', 'a-level' and 'alevel' all
 * collapse onto the same key. Applied to both the input and the registry slugs. */
const collapse = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Spellings users and older rows use that don't collapse onto a slug on their own. */
const EXAM_TYPE_ALIASES: Record<string, SupportedExamType> = {
  cbse10: 'cbse-10',
  cbseclass10: 'cbse-10',
  cbse12: 'cbse-12',
  cbseclass12: 'cbse-12',
  icseclass10: 'icse',
  iscclass12: 'isc',
  ib: 'ib-dp',
  ibdiploma: 'ib-dp',
  ibdiplomaprogramme: 'ib-dp',
  // Entrance exams. Bare 'eamcet' is deliberately absent: it names both the Telangana and
  // the Andhra Pradesh test, and silently picking one is worse than rejecting the input.
  neet: 'neet-ug',
  jeemains: 'jee-main',
  jeeadvance: 'jee-advanced',
  tgeapcet: 'ts-eamcet',
  tseapcet: 'ts-eamcet',
  apeamcet: 'ap-eapcet',
  // 'COMEDK UGET' is the only new dbName that does not collapse onto its own slug, and the
  // assignment marking path feeds qualifications.name straight through here, so this one
  // is load-bearing rather than a convenience.
  comedkuget: 'comedk',
  mahacet: 'mht-cet',
  wbjeeb: 'wbjee',
  cuet: 'cuet-ug',
  srmjee: 'srmjeee',
  ipmatindore: 'ipmat',
};

export const normalizeBoard = (value?: string): SupportedBoard | null => {
  const cleaned = collapse(txt(value || '', 24));
  return SUPPORTED_EXAM_BOARDS.find((board) => collapse(board) === cleaned) ?? null;
};

export const normalizeExamType = (value?: string): SupportedExamType | null => {
  const cleaned = collapse(txt(value || '', 32));
  const direct = SUPPORTED_EXAM_TYPES.find((type) => collapse(type) === cleaned);
  if (direct) return direct;
  return EXAM_TYPE_ALIASES[cleaned] ?? null;
};

export const normalizeSubject = (value?: string): SupportedSubject | null => {
  const cleaned = txt(value || '', 120).toLowerCase();
  return SUPPORTED_SUBJECTS.includes(cleaned as SupportedSubject) ? (cleaned as SupportedSubject) : null;
};

export const clampCount = (value: unknown, min: number, max: number, fallback: number) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(Math.max(Math.floor(numberValue), min), max);
};
