/** The single source of truth for subject slugs and their display labels.
 * Lives in its own module because both subjectConfig.ts (client) and validation.ts
 * (server) need it, and validation.ts must not pull in specifications.json. */

export const SUPPORTED_SUBJECTS = [
  'biology',
  'chemistry',
  'physics',
  // GCSE Combined Science is worth two GCSEs and is examined as three science papers,
  // so it is three subjects rather than one. Each slug must stay an exact lowercase copy
  // of its `subjects.name` row: mapStudentSubjectRow lowercases the name to get the slug
  // and resolveSubjectId feeds the label straight back as a database lookup key.
  'combined science (biology)',
  'combined science (chemistry)',
  'combined science (physics)',
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
  // Indian qualifications (CBSE / CISCE) and IB
  'science',
  'social science',
  'history and civics',
  'accountancy',
  'business studies',
  'commerce',
  'political science',
  'sociology',
  'commercial studies',
  'environmental science',
  'computer applications',
  'information technology',
  'global politics',
  'visual arts',
  'hindi',
  'sanskrit',
  'french',
  'spanish',
  // Entrance-exam papers that are not school subjects. BITSAT and the private university
  // tests bolt an English and reasoning section onto PCM; CLAT, NDA and IPMAT are built
  // almost entirely out of these.
  'english proficiency',
  'logical reasoning',
  'aptitude',
  'legal reasoning',
  'current affairs',
  'quantitative ability',
  'verbal ability',
  'general knowledge',
] as const;

export type SupportedSubject = (typeof SUPPORTED_SUBJECTS)[number];

export const SUBJECT_LABELS: Record<SupportedSubject, string> = {
  biology: 'Biology',
  chemistry: 'Chemistry',
  physics: 'Physics',
  'combined science (biology)': 'Combined Science (Biology)',
  'combined science (chemistry)': 'Combined Science (Chemistry)',
  'combined science (physics)': 'Combined Science (Physics)',
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
  science: 'Science',
  'social science': 'Social Science',
  'history and civics': 'History and Civics',
  accountancy: 'Accountancy',
  'business studies': 'Business Studies',
  commerce: 'Commerce',
  'political science': 'Political Science',
  sociology: 'Sociology',
  'commercial studies': 'Commercial Studies',
  'environmental science': 'Environmental Science',
  'computer applications': 'Computer Applications',
  'information technology': 'Information Technology',
  'global politics': 'Global Politics',
  'visual arts': 'Visual Arts',
  hindi: 'Hindi',
  sanskrit: 'Sanskrit',
  french: 'French',
  spanish: 'Spanish',
  'english proficiency': 'English Proficiency',
  'logical reasoning': 'Logical Reasoning',
  aptitude: 'Aptitude',
  'legal reasoning': 'Legal Reasoning',
  'current affairs': 'Current Affairs',
  'quantitative ability': 'Quantitative Ability',
  'verbal ability': 'Verbal Ability',
  'general knowledge': 'General Knowledge',
};

export const getSubjectLabel = (subject: string) =>
  SUBJECT_LABELS[subject as SupportedSubject] ?? subject.charAt(0).toUpperCase() + subject.slice(1);
