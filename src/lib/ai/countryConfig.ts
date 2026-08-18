export const COUNTRIES = ['uk', 'india', 'us', 'international'] as const;
export type Country = (typeof COUNTRIES)[number];

export const COUNTRY_LABELS: Record<Country, string> = {
  uk: 'United Kingdom',
  india: 'India',
  us: 'United States',
  international: 'International',
};

// Which qualifications each country offers now lives in the registry in
// qualifications.ts — import getQualifications / getQualificationConfig from there.
