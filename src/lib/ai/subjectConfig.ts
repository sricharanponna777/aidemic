import specificationsData from '@/lib/ai/specifications.json';

export const SUPPORTED_SUBJECTS = [
  'biology',
  'chemistry',
  'physics',
  'mathematics',
  'english language',
  'english literature',
  'english',
  'history',
  'geography',
  'economics',
  'psychology',
  'business',
  'computer science',
] as const;

export type SupportedSubject = (typeof SUPPORTED_SUBJECTS)[number];
export const SELECTABLE_SUBJECTS = SUPPORTED_SUBJECTS.filter((subject) => subject !== 'english');
export type ExamBoard = 'aqa' | 'edexcel' | 'ocr';
export type ExamType = 'gcse' | 'a-level';

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

export const SUBJECT_LABELS: Record<SupportedSubject, string> = {
  biology: 'Biology',
  chemistry: 'Chemistry',
  physics: 'Physics',
  mathematics: 'Mathematics',
  'english language': 'English Language',
  'english literature': 'English Literature',
  english: 'English',
  history: 'History',
  geography: 'Geography',
  economics: 'Economics',
  psychology: 'Psychology',
  business: 'Business',
  'computer science': 'Computer Science',
};

export const getSubjectLabel = (subject: string) =>
  SUBJECT_LABELS[subject as SupportedSubject] ?? subject.charAt(0).toUpperCase() + subject.slice(1);

export const getExamBoardLabel = (board: string) => board.toUpperCase();

export const getExamTypeLabel = (type: string) => type === 'a-level' ? 'A-Level' : 'GCSE';

export const getSpecEntries = (subject?: UserSubject | null) => {
  if (!subject) return [];
  if (subject.subject === 'english language' && subject.exam_board !== 'aqa') return [];
  return specifications[subject.exam_board]?.[subject.exam_type]?.[subject.subject] ?? [];
};

export const getSelectedSpecEntry = (subject: UserSubject | null, specName?: string | null) => {
  const entries = getSpecEntries(subject);
  if (entries.length === 1) return entries[0];
  return entries.find((entry) => entry.name === specName) ?? null;
};

export const requiresTierSelection = (subject: UserSubject | null, specName?: string | null) =>
  subject?.exam_type === 'gcse' && !!getSelectedSpecEntry(subject, specName)?.tiers?.length;

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
