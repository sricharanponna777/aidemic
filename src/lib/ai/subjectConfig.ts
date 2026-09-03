import specificationsData from '@/lib/ai/specifications.json';
import { SUPPORTED_SUBJECTS, SUBJECT_LABELS, getSubjectLabel, type SupportedSubject } from '@/lib/ai/subjects';
import {
  getExamBoardLabel,
  getExamTypeLabel,
  isUkQualification,
  qualificationById,
  type ExamBoard,
  type ExamType,
} from '@/lib/ai/qualifications';

export { SUPPORTED_SUBJECTS, SUBJECT_LABELS, getSubjectLabel, getExamBoardLabel, getExamTypeLabel };
export type { SupportedSubject, ExamBoard, ExamType };

/** 'english' is a legacy catch-all kept for validating older rows; it is never offered
 * in a picker. Every other supported subject is. */
export const SELECTABLE_SUBJECTS = SUPPORTED_SUBJECTS.filter((subject) => subject !== 'english');

export type UserSubject = {
  id: string;
  subject: SupportedSubject;
  exam_board: ExamBoard;
  exam_type: ExamType;
  spec_name?: string | null;
  spec_tier?: string | null;
};

export type SpecEntry = { name: string; tiers?: string[]; options?: string[]; papers?: number };
type SpecBoard = Record<string, Record<string, Record<string, SpecEntry[]>>>;

export const specifications = specificationsData as SpecBoard;

/** The subjects offered for a board + qualification, read from specifications.json so a
 * picker never offers a combination that has no specification behind it. Ordered by
 * SUPPORTED_SUBJECTS so the list reads the same everywhere. */
export const getSelectableSubjects = (board?: string | null, examType?: string | null): SupportedSubject[] => {
  const available = specifications[board ?? '']?.[examType ?? ''];
  if (!available) return [...SELECTABLE_SUBJECTS];
  return SELECTABLE_SUBJECTS.filter((subject) => subject in available);
};

export const getSpecEntries = (subject?: UserSubject | null) => {
  if (!subject) return [];
  // UK English Language practice is built around the AQA papers only. Other countries
  // have their own single board, so the rule must not leak outside the UK.
  if (
    subject.subject === 'english language' &&
    isUkQualification(subject.exam_type) &&
    subject.exam_board !== 'aqa'
  ) {
    return [];
  }
  return specifications[subject.exam_board]?.[subject.exam_type]?.[subject.subject] ?? [];
};

export const getSelectedSpecEntry = (subject: UserSubject | null, specName?: string | null) => {
  const entries = getSpecEntries(subject);
  if (entries.length === 1) return entries[0];
  return entries.find((entry) => entry.name === specName) ?? null;
};

export const requiresTierSelection = (subject: UserSubject | null, specName?: string | null) =>
  !!qualificationById(subject?.exam_type)?.tier &&
  !!getSelectedSpecEntry(subject, specName)?.tiers?.length;

/** The label for the tier/level picker — "Tier" for GCSE, "Level" for CBSE and IB. */
export const getTierLabel = (examType?: string | null) =>
  qualificationById(examType)?.tier?.label ?? 'Tier';

export const getPaperCount = (subject: UserSubject | null, specName?: string | null): number =>
  getSelectedSpecEntry(subject, specName ?? getSavedSpecName(subject))?.papers ?? 0;

export const getPaperOptions = (subject: UserSubject | null, specName?: string | null): string[] => {
  const count = getPaperCount(subject, specName);
  return Array.from({ length: count }, (_, index) => `Paper ${index + 1}`);
};

export const buildSpecString = (specName: string, specTier: string, specOption: string): string => {
  if (!specName) return '';
  return [specName, specTier, specOption].filter(Boolean).join(' - ');
};

export const getSavedSpecName = (subject: UserSubject | null) => {
  const entries = getSpecEntries(subject);
  if (entries.length === 1) return entries[0].name;
  return subject?.spec_name ?? '';
};

export const getSavedSpecEntry = (subject: UserSubject | null) =>
  getSelectedSpecEntry(subject, getSavedSpecName(subject));

export const getSavedSpecLabel = (subject: UserSubject | null, creationOption = '') =>
  buildSpecString(getSavedSpecName(subject), subject?.spec_tier ?? '', creationOption);

export const getCreationOptionChoices = (subject: UserSubject | null) => {
  if (subject?.subject === 'history') return [];
  const options = getSavedSpecEntry(subject)?.options ?? [];
  if (
    subject?.subject === 'english literature' ||
    (subject?.subject === 'english' && getSavedSpecName(subject).toLowerCase().includes('literature'))
  ) {
    return options.filter((option) => option.toLowerCase() !== 'unseen poetry');
  }
  return options;
};

export const getCreationOptionLabel = (subject?: UserSubject | null) => {
  if (
    subject?.subject === 'english literature' ||
    (subject?.subject === 'english' && getSavedSpecName(subject).toLowerCase().includes('literature'))
  ) {
    return 'English text';
  }
  return 'Topic focus';
};

export const isSubjectSpecComplete = (subject: UserSubject | null) => {
  const entries = getSpecEntries(subject);
  if (entries.length === 0) return false;
  if (entries.length > 1 && !subject?.spec_name) return false;
  return !requiresTierSelection(subject, getSavedSpecName(subject)) || !!subject?.spec_tier;
};

/**
 * Whether a subject's questions are written *about* a passage, so the source
 * extract belongs on screen.
 *
 * An AQA English Language set asks you to list four things from the source and
 * is unanswerable without it. Everywhere else the model occasionally emits a
 * stray `sourceMaterial` that no question refers to, which rendered an
 * authoritative "Source Extract" panel above a maths paper for no reason --
 * so this gates on the subject rather than on the text being non-empty.
 */
export const hasSourceExtract = (subject: string | null | undefined) =>
  ['english language', 'english literature', 'english'].includes((subject ?? '').trim().toLowerCase());
