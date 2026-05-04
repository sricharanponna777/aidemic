import { txt } from '@/lib/ai/text';

export const SUPPORTED_SUBJECTS = [
  'biology',
  'chemistry',
  'physics',
  'mathematics',
  'english',
  'history',
  'geography',
  'economics',
  'psychology',
  'business',
  'computer science',
] as const;

export type SupportedSubject = (typeof SUPPORTED_SUBJECTS)[number];
export type SupportedBoard = 'aqa' | 'edexcel' | 'ocr';
export type SupportedExamType = 'gcse' | 'a-level';

export const SUPPORTED_EXAM_BOARDS: SupportedBoard[] = ['aqa', 'edexcel', 'ocr'];
export const SUPPORTED_EXAM_TYPES: SupportedExamType[] = ['gcse', 'a-level'];

export const normalizeBoard = (value?: string): SupportedBoard | null => {
  const cleaned = txt(value || '', 24).toLowerCase().replace(/\s+/g, '');
  if (cleaned === 'aqa') return 'aqa';
  if (cleaned === 'edexcel') return 'edexcel';
  if (cleaned === 'ocr') return 'ocr';
  return null;
};

export const normalizeExamType = (value?: string): SupportedExamType | null => {
  const cleaned = txt(value || '', 24).toLowerCase().replace(/\s+/g, '');
  if (cleaned === 'gcse') return 'gcse';
  if (cleaned === 'a-level' || cleaned === 'alevel') return 'a-level';
  return null;
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
