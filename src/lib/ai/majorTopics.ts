import {
  getSavedSpecEntry,
  getSavedSpecName,
  specifications,
  type ExamBoard,
  type ExamType,
  type SupportedSubject,
  type UserSubject,
} from '@/lib/ai/subjectConfig';

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const GCSE_TOPICS: Record<string, string[]> = {
  biology: [
    'Cell biology',
    'Organisation',
    'Infection and response',
    'Bioenergetics',
    'Homeostasis and response',
    'Inheritance, variation and evolution',
    'Ecology',
    'Required practical skills',
  ],
  chemistry: [
    'Atomic structure and the periodic table',
    'Bonding, structure and properties of matter',
    'Quantitative chemistry',
    'Chemical changes',
    'Energy changes',
    'Rate and extent of chemical change',
    'Organic chemistry',
    'Chemical analysis',
    'Chemistry of the atmosphere',
    'Using resources',
  ],
  physics: [
    'Energy',
    'Electricity',
    'Particle model of matter',
    'Atomic structure and radiation',
    'Forces',
    'Waves',
    'Magnetism and electromagnetism',
    'Space physics',
    'Required practical skills',
  ],
  mathematics: [
    'Number',
    'Algebra',
    'Ratio, proportion and rates of change',
    'Geometry and measures',
    'Probability',
    'Statistics',
  ],
  'english language': [
    'Paper 1 fiction reading',
    'Paper 1 creative writing',
    'Language analysis',
    'Structure analysis',
    'Evaluation',
    'Paper 2 non-fiction reading',
    'Comparison',
    'Viewpoints and perspectives',
    'Transactional writing',
  ],
  'english literature': [
    'Shakespeare',
    '19th-century novel',
    'Modern prose or drama',
    'Poetry anthology',
    'Unseen poetry',
    'Themes',
    'Character analysis',
    'Context',
  ],
  geography: [
    'Physical landscapes',
    'River landscapes',
    'Coastal landscapes',
    'Weather hazards',
    'Climate change',
    'Ecosystems',
    'Urban issues',
    'Economic development',
    'Resource management',
    'Geographical skills',
    'Fieldwork',
  ],
  economics: [
    'Economic foundations',
    'Resource allocation',
    'Demand and supply',
    'Markets',
    'Market failure',
    'Government intervention',
    'The national economy',
    'Inflation',
    'Unemployment',
    'International trade',
  ],
  psychology: [
    'Memory',
    'Perception',
    'Development',
    'Research methods',
    'Social influence',
    'Language, thought and communication',
    'Brain and neuropsychology',
    'Psychological problems',
  ],
  business: [
    'Business activity',
    'Enterprise and entrepreneurship',
    'Marketing',
    'Operations',
    'Finance',
    'Human resources',
    'Business growth',
    'External influences',
  ],
  'computer science': [
    'Algorithms',
    'Programming fundamentals',
    'Data representation',
    'Computer systems',
    'Networks',
    'Cyber security',
    'Databases',
    'Boolean logic',
    'Ethical, legal and environmental impacts',
  ],
};

const ENGLISH_LITERATURE_TEXT_FOCUSES = [
  'Context',
  'Quotes',
  'Plot',
  'Characters',
  'Themes',
  'Writer methods',
  'Exam technique',
];

const POETRY_CLUSTER_POEMS: Record<string, string[]> = {
  'Power and Conflict poetry': [
    'Ozymandias',
    'London',
    'The Prelude',
    'My Last Duchess',
    'The Charge of the Light Brigade',
    'Exposure',
    'Storm on the Island',
    'Bayonet Charge',
    'Remains',
    'Poppies',
    'War Photographer',
    'Tissue',
    'The Emigree',
    'Checking Out Me History',
    'Kamikaze',
  ],
  'Love and Relationships poetry': [
    'When We Two Parted',
    "Love's Philosophy",
    "Porphyria's Lover",
    'Sonnet 29',
    'Neutral Tones',
    'Letters from Yorkshire',
    "The Farmer's Bride",
    'Walking Away',
    'Eden Rock',
    'Follower',
    'Mother, any distance',
    'Before You Were Mine',
    'Winter Swans',
    'Singh Song!',
    'Climbing My Grandfather',
  ],
};

const POETRY_ANALYSIS_TOPICS = [
  'Analysis',
  'Context',
  'Quotes',
  'Themes',
  'Language',
  'Structure',
  'Form',
  'Imagery',
  'Tone',
  'Speaker',
];

const POETRY_COMPARISON_TOPICS = [
  'Comparison',
  'Context comparison',
  'Quote comparison',
  'Theme comparison',
  'Language comparison',
  'Structure comparison',
  'Form comparison',
  'Imagery comparison',
  'Tone comparison',
  'Speaker comparison',
];

const POETRY_CLUSTER_THEMES: Record<string, string[]> = {
  'Power and Conflict poetry': [
    'Power of humans',
    'Power of nature',
    'Abuse of power',
    'Effects of conflict',
    'Reality of war',
    'Memory and trauma',
    'Identity and heritage',
    'Patriotism and duty',
    'Loss and grief',
    'Place and belonging',
    'Individual experience of conflict',
  ],
  'Love and Relationships poetry': [
    'Romantic love',
    'Family relationships',
    'Parent and child relationships',
    'Distance and separation',
    'Loss and grief',
    'Memory',
    'Conflict in relationships',
    'Power in relationships',
    'Possessive love',
    'Change over time',
    'Nature and relationships',
    'Identity and belonging',
  ],
};

const getPoetryThemeTopics = (cluster: string, mode: 'analysis' | 'comparison') => {
  const themes = POETRY_CLUSTER_THEMES[cluster] ?? [];
  return mode === 'comparison'
    ? themes.map((theme) => `${theme} comparison`)
    : themes;
};

const A_LEVEL_TOPICS: Record<string, string[]> = {
  biology: [
    'Biological molecules',
    'Cells',
    'Exchange and transport',
    'Genetic information',
    'Energy transfers',
    'Organisms respond to change',
    'Genetics, populations and evolution',
    'Gene expression',
    'Practical skills',
  ],
  chemistry: [
    'Atomic structure',
    'Amount of substance',
    'Bonding',
    'Energetics',
    'Kinetics',
    'Equilibria',
    'Redox',
    'Inorganic chemistry',
    'Organic chemistry',
    'Spectroscopy',
    'Practical skills',
  ],
  physics: [
    'Measurements and errors',
    'Particles and radiation',
    'Waves',
    'Mechanics and materials',
    'Electricity',
    'Further mechanics',
    'Thermal physics',
    'Fields',
    'Nuclear physics',
    'Astrophysics',
  ],
  mathematics: [
    'Proof',
    'Algebra and functions',
    'Coordinate geometry',
    'Sequences and series',
    'Trigonometry',
    'Exponentials and logarithms',
    'Differentiation',
    'Integration',
    'Numerical methods',
    'Vectors',
    'Statistics',
    'Mechanics',
  ],
  'english language': [
    'Language levels',
    'Meanings and representations',
    'Language diversity',
    'Language change',
    'Child language development',
    'Language discourses',
    'Original writing',
    'Language investigation',
  ],
  'english literature': [
    'Drama',
    'Prose',
    'Poetry',
    'Tragedy',
    'Comedy',
    'Crime writing',
    'Political and social protest writing',
    'Literary contexts',
    'Critical interpretations',
  ],
  geography: [
    'Water and carbon cycles',
    'Coastal systems and landscapes',
    'Hazards',
    'Ecosystems under stress',
    'Global systems and governance',
    'Changing places',
    'Contemporary urban environments',
    'Population and the environment',
    'Geographical skills',
    'Independent investigation',
  ],
  economics: [
    'Individuals, firms, markets and market failure',
    'The national economy',
    'Business behaviour',
    'Labour markets',
    'Financial markets',
    'Macroeconomic policy',
    'International economics',
    'Development economics',
  ],
  psychology: [
    'Social influence',
    'Memory',
    'Attachment',
    'Psychopathology',
    'Approaches',
    'Biopsychology',
    'Research methods',
    'Issues and debates',
  ],
  business: [
    'What is business',
    'Managers, leadership and decision making',
    'Marketing performance',
    'Operational performance',
    'Financial performance',
    'Human resource performance',
    'Strategic positioning',
    'Strategic methods',
    'Managing strategic change',
  ],
  'computer science': [
    'Programming',
    'Data structures',
    'Algorithms',
    'Theory of computation',
    'Data representation',
    'Computer systems',
    'Computer organisation and architecture',
    'Communication and networking',
    'Databases',
    'Functional programming',
  ],
};

const TOPIC_OVERRIDES: Record<string, string[]> = {
  'AQA GCSE Geography': [
    'The challenge of natural hazards',
    'Tectonic hazards',
    'Weather hazards',
    'Climate change',
    'The living world',
    'UK physical landscapes',
    'River landscapes in the UK',
    'Coastal landscapes in the UK',
    'Urban issues and challenges',
    'The changing economic world',
    'Resource management',
    'Geographical skills',
    'Fieldwork',
  ],
  'Edexcel GCSE Geography A': [
    'The changing landscapes of the UK',
    'Coastal landscapes and processes',
    'River landscapes and processes',
    'Weather hazards and climate change',
    'Ecosystems, biodiversity and management',
    'Changing cities',
    'Global development',
    'Resource management',
    'Geographical investigations',
    'Geographical skills',
  ],
  'Edexcel GCSE Geography B': [
    'Hazardous Earth',
    'Development dynamics',
    'Challenges of an urbanising world',
    'The UK physical environment',
    'The UK human environment',
    'People and environment issues',
    'Forests under threat',
    'Consuming energy resources',
    'Geographical investigations',
    'Geographical skills',
  ],
  'OCR GCSE Geography A': [
    'Landscapes of the UK',
    'People of the UK',
    'Environmental threats to our planet',
    'Natural hazards',
    'Climate change',
    'Ecosystems',
    'Resource reliance',
    'Fieldwork',
    'Geographical skills',
  ],
  'OCR GCSE Geography B': [
    'Global hazards',
    'Changing climate',
    'Distinctive landscapes',
    'Sustaining ecosystems',
    'Urban futures',
    'Dynamic development',
    'UK in the 21st century',
    'Resource reliance',
    'Fieldwork',
    'Geographical skills',
  ],
};

export const isEnglishLiteratureSubject = (subject: UserSubject | null, specName = '') =>
  subject?.subject === 'english literature' ||
  (subject?.subject === 'english' && specName.toLowerCase().includes('literature'));

export const isPoetryCluster = (value?: string | null) => !!value && !!POETRY_CLUSTER_POEMS[value];

export const getPoetryClusterPoems = (value?: string | null) => value ? POETRY_CLUSTER_POEMS[value] ?? [] : [];

export const buildLiteratureCreationOption = (text: string, poemOne = '', poemTwo = '') =>
  [text, poemOne, poemTwo].filter(Boolean).join(' - ');

export const getMajorTopicsForSubject = (
  subject: UserSubject | null,
  creationOption = '',
  poemOne = '',
  poemTwo = '',
): string[] => {
  if (!subject) return [];

  const specName = getSavedSpecName(subject);
  const specTopics = specName ? TOPIC_OVERRIDES[specName] ?? [] : [];
  const baseTopics = subject.exam_type === 'a-level'
    ? A_LEVEL_TOPICS[subject.subject] ?? []
    : GCSE_TOPICS[subject.subject] ?? [];
  const rawOptionTopics = getSavedSpecEntry(subject)?.options ?? [];
  const isEnglishLiterature = isEnglishLiteratureSubject(subject, specName);
  if (isEnglishLiterature) {
    if (isPoetryCluster(creationOption)) {
      if (poemOne && poemTwo) return unique([...POETRY_COMPARISON_TOPICS, ...getPoetryThemeTopics(creationOption, 'comparison')]);
      if (poemOne) return unique([...POETRY_ANALYSIS_TOPICS, ...getPoetryThemeTopics(creationOption, 'analysis')]);
      return [];
    }
    return creationOption ? unique(ENGLISH_LITERATURE_TEXT_FOCUSES) : unique([...specTopics, ...baseTopics]);
  }
  const optionTopics = rawOptionTopics;

  return unique([...specTopics, ...optionTopics, ...baseTopics]);
};

type QualificationTopicInput = {
  subject?: string | null;
  examBoard?: string | null;
  examType?: string | null;
  specification?: string | null;
};

const normalise = (value?: string | null) => (value ?? '').trim().toLowerCase();

const getSpecNameFromLabel = ({
  subject,
  examBoard,
  examType,
  specification,
}: QualificationTopicInput) => {
  const board = normalise(examBoard) as ExamBoard;
  const type = normalise(examType) as ExamType;
  const cleanSubject = normalise(subject) as SupportedSubject;
  const cleanSpecification = specification ?? '';
  const entries = specifications[board]?.[type]?.[cleanSubject] ?? [];
  return entries.find((entry) => cleanSpecification.startsWith(entry.name))?.name ?? '';
};

export const getMajorTopicsForQualification = (input: QualificationTopicInput): string[] => {
  const subject = normalise(input.subject) as SupportedSubject;
  const examBoard = normalise(input.examBoard) as ExamBoard;
  const examType = normalise(input.examType) as ExamType;
  if (!subject || !examBoard || !examType) return [];

  const specName = getSpecNameFromLabel(input);
  const subjectRow: UserSubject = {
    id: 'qualification',
    subject,
    exam_board: examBoard,
    exam_type: examType,
    spec_name: specName || null,
    spec_tier: input.specification?.toLowerCase().includes('foundation')
      ? 'Foundation'
      : input.specification?.toLowerCase().includes('higher')
        ? 'Higher'
        : null,
  };
  const labelParts = (input.specification ?? '')
    .split(' - ')
    .map((part) => part.trim())
    .filter((part) => part && part !== specName && part !== subjectRow.spec_tier);

  if (isEnglishLiteratureSubject(subjectRow, specName)) {
    const selectedText = labelParts[0] ?? '';
    if (isPoetryCluster(selectedText)) {
      const selectedPoems = labelParts.slice(1).filter((part) => getPoetryClusterPoems(selectedText).includes(part));
      if (selectedPoems.length >= 2) return unique([...POETRY_COMPARISON_TOPICS, ...getPoetryThemeTopics(selectedText, 'comparison')]);
      if (selectedPoems.length === 1) return unique([...POETRY_ANALYSIS_TOPICS, ...getPoetryThemeTopics(selectedText, 'analysis')]);
      return [];
    }
    const generalTopics = subjectRow.exam_type === 'a-level'
      ? A_LEVEL_TOPICS['english literature']
      : GCSE_TOPICS['english literature'];
    return selectedText
      ? unique(ENGLISH_LITERATURE_TEXT_FOCUSES)
      : unique(generalTopics);
  }

  return unique([...getMajorTopicsForSubject(subjectRow), ...labelParts]);
};

export const isAllowedQualificationTopic = (topic: string, topics: string[]) => {
  const cleanTopic = normalise(topic);
  return topics.some((option) => normalise(option) === cleanTopic);
};

export const getQualificationTopicError = (topic: string, topics: string[]) => {
  if (isAllowedQualificationTopic(topic, topics)) return null;
  return 'Choose one of the suggested topics for this qualification before generating content.';
};
