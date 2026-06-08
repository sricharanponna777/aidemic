type TopicRelevanceInput = {
  topic: string;
  subject?: string | null;
  examBoard?: string | null;
  examType?: string | null;
  specification?: string | null;
};

type Rule = {
  subjects: string[];
  examBoards?: string[];
  examTypes: string[];
  patterns: RegExp[];
  message: string;
};

const gcsePhysicsAdvancedPatterns = [
  /\bquantum\b/i,
  /\bquantum\s+(mechanics|physics|theory|field)\b/i,
  /\bschro(?:e|ö)dinger\b/i,
  /\bwave\s*function\b/i,
  /\bwavefunction\b/i,
  /\brelativity\b/i,
  /\bspecial\s+relativity\b/i,
  /\bgeneral\s+relativity\b/i,
  /\btime\s+dilation\b/i,
  /\blorentz\b/i,
];

const gcseMathsAdvancedPatterns = [
  /\bdifferential\s+equations?\b/i,
  /\bcomplex\s+numbers?\b/i,
  /\bimaginary\s+numbers?\b/i,
  /\bmatrix\b/i,
  /\bmatrices\b/i,
  /\beigen(?:value|vector)s?\b/i,
  /\btaylor\s+series\b/i,
  /\bmaclaurin\s+series\b/i,
  /\bintegration\s+by\s+parts\b/i,
  /\bpartial\s+fractions?\b/i,
];

const obviousMismatchRules: Rule[] = [
  {
    subjects: ['geography'],
    examBoards: ['edexcel'],
    examTypes: ['gcse'],
    patterns: [
      /\btectonic(s)?\b/i,
      /\bplate\s+(tectonics?|boundar(?:y|ies)|margin)s?\b/i,
      /\bearthquakes?\b/i,
      /\bvolcano(?:es|s)?\b/i,
      /\btsunamis?\b/i,
    ],
    message:
      'That topic does not appear to fit Edexcel GCSE Geography. Choose a qualification that includes tectonics, or pick a topic from your saved Edexcel specification.',
  },
  {
    subjects: ['physics', 'science'],
    examTypes: ['gcse'],
    patterns: gcsePhysicsAdvancedPatterns,
    message:
      'That topic looks beyond GCSE Physics. Choose an A-Level Physics qualification or use a GCSE Physics topic from this specification.',
  },
  {
    subjects: ['biology', 'chemistry'],
    examTypes: ['gcse'],
    patterns: gcsePhysicsAdvancedPatterns,
    message:
      'That topic looks like advanced Physics rather than this GCSE subject. Choose the matching subject and qualification first.',
  },
  {
    subjects: ['mathematics'],
    examTypes: ['gcse'],
    patterns: gcseMathsAdvancedPatterns,
    message:
      'That topic looks beyond GCSE Mathematics. Choose an A-Level Mathematics qualification or use a GCSE Maths topic from this specification.',
  },
  {
    subjects: ['english language'],
    examTypes: ['gcse', 'a-level'],
    patterns: [
      /\bmacbeth\b/i,
      /\bromeo\s+and\s+juliet\b/i,
      /\ban\s+inspector\s+calls\b/i,
      /\ba\s+christmas\s+carol\b/i,
      /\bpoetry\s+anthology\b/i,
    ],
    message:
      'That looks like an English Literature text. Choose English Literature for set texts, or use an English Language skill or paper focus.',
  },
  {
    subjects: ['english literature'],
    examTypes: ['gcse', 'a-level'],
    patterns: [
      /\blanguage\s+paper\s+1\b/i,
      /\blanguage\s+paper\s+2\b/i,
      /\btransactional\s+writing\b/i,
      /\bcreative\s+writing\b/i,
      /\bviewpoints?\s+and\s+perspectives\b/i,
    ],
    message:
      'That looks like English Language rather than English Literature. Choose English Language for paper skills, or use a Literature text or theme.',
  },
];

const normalise = (value?: string | null) => (value ?? '').trim().toLowerCase();

export const getTopicRelevanceError = ({
  topic,
  subject,
  examBoard,
  examType,
  specification,
}: TopicRelevanceInput): string | null => {
  const cleanTopic = topic.trim();
  if (cleanTopic.length < 3) return null;

  const cleanSubject = normalise(subject);
  const cleanExamBoard = normalise(examBoard);
  const cleanExamType = normalise(examType);
  const combinedTopic = `${cleanTopic} ${specification ?? ''}`;

  const matchedRule = obviousMismatchRules.find((rule) => {
    const subjectMatches = rule.subjects.some((ruleSubject) => cleanSubject.includes(ruleSubject));
    const boardMatches = !rule.examBoards || rule.examBoards.includes(cleanExamBoard);
    const examTypeMatches = rule.examTypes.includes(cleanExamType);
    const patternMatches = rule.patterns.some((pattern) => pattern.test(combinedTopic));
    return subjectMatches && boardMatches && examTypeMatches && patternMatches;
  });

  return matchedRule?.message ?? null;
};
