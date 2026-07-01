import type { ExamBoard, ExamType } from './subjectConfig';

export const COUNTRIES = ['uk', 'india', 'us', 'international'] as const;
export type Country = (typeof COUNTRIES)[number];

export const COUNTRY_LABELS: Record<Country, string> = {
  uk: 'United Kingdom',
  india: 'India',
  us: 'United States',
  international: 'International',
};

export type QualificationConfig = {
  id: string;
  label: string;
  examType?: ExamType;
  boards?: ExamBoard[];
  comingSoon?: boolean;
};

export const COUNTRY_QUALIFICATIONS: Record<Country, QualificationConfig[]> = {
  uk: [
    { id: 'gcse', label: 'GCSE', examType: 'gcse', boards: ['aqa', 'edexcel', 'ocr'] },
    { id: 'a-level', label: 'A-Level', examType: 'a-level', boards: ['aqa', 'edexcel', 'ocr'] },
  ],
  india: [
    { id: 'cbse', label: 'CBSE', comingSoon: true },
    { id: 'icse', label: 'ICSE', comingSoon: true },
    { id: 'ib', label: 'IB Diploma', comingSoon: true },
  ],
  us: [
    { id: 'ap', label: 'AP (Advanced Placement)', comingSoon: true },
    { id: 'ib', label: 'IB Diploma', comingSoon: true },
  ],
  international: [
    { id: 'ib', label: 'IB Diploma Programme', comingSoon: true },
    { id: 'cambridge-igcse', label: 'Cambridge IGCSE', comingSoon: true },
    { id: 'cambridge-a-level', label: 'Cambridge A-Level', comingSoon: true },
  ],
};

export const getQualifications = (country: Country): QualificationConfig[] =>
  COUNTRY_QUALIFICATIONS[country] ?? [];

export const getQualificationConfig = (country: Country, qualId: string): QualificationConfig | null =>
  COUNTRY_QUALIFICATIONS[country]?.find((q) => q.id === qualId) ?? null;
