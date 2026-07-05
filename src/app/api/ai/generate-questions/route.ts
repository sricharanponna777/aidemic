import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { OPENAI_DEFAULT_BASE_URL, buildAIHeaders, getAIConfig, getMissingHostedKeyError } from '@/lib/ai/config';
import {
  extractFromResponsesBody,
  extractJsonWithCoercer,
  tryExtractWithCoercer,
  type ChatCompletionsResponseBody,
  type OpenAIResponseBody,
} from '@/lib/ai/json';
import { getMajorTopicsForQualification, getQualificationTopicError } from '@/lib/ai/majorTopics';
import { normalizeMathNotation } from '@/lib/ai/math';
import { cleanText, dedupe, extractFigureUrls, isChartPlottingTopic, isDataAnalysisObjective, MAX_AI_ERROR_TEXT, safe, sanitizeFigureUrl, txt } from '@/lib/ai/text';
import { normalizePlotSpec, PLOT_SPEC_JSON_SCHEMA } from '@/lib/ai/plotSpec';
import { getTopicRelevanceError } from '@/lib/ai/topicRelevance';
import {
  clampCount,
  normalizeBoard,
  normalizeExamType,
  SUPPORTED_EXAM_BOARDS,
  SUPPORTED_EXAM_TYPES,
  SUPPORTED_SUBJECTS,
  type SupportedSubject,
} from '@/lib/ai/validation';
import type { PlotSpec } from '@/types';

type QuestionType = 'open' | 'mcq' | 'plot';
type CorrectOption = '' | 'A' | 'B' | 'C' | 'D';

interface GenerateQuestionsPayload {
  topic?: string;
  subtopic?: string;
  learningObjective?: string;
  paper?: string;
  subject?: string;
  prompt?: string;
  examBoard?: string;
  examType?: string;
  specification?: string;
  figureUrl?: string;
  questionCount?: number;
  allowMcq?: boolean;
  allowCalculation?: boolean;
  allowPlot?: boolean;
  useOnlineResources?: boolean;
}

export type ExamQuestion = {
  questionType: QuestionType;
  question: string;
  marks: number;
  commandWord: string;
  isCalculation: boolean;
  options: string[];
  correctOption: CorrectOption;
  markScheme: string[];
  modelAnswer: string;
  skillsAssessed: string[];
  figureUrl?: string;
  sourceTitle: string;
  sourceUrl: string;
  plotSpec: PlotSpec | null;
};

type SourceReference = {
  title: string;
  url: string;
};

type GeneratedExamQuestions = {
  questions: ExamQuestion[];
  sourceMaterial?: string;
};

type AIQuestionResult = {
  generated: GeneratedExamQuestions;
  usedOnlineResources: boolean;
  onlineLookupFailed: boolean;
  onlineLookupReason: string;
};

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 20;
const MIN_MARK_VALUE = 1;
const MAX_MARK_VALUE = 40;
const GENERATION_MAX_OUTPUT_TOKENS = 6000;
const MAX_AI_RESPONSE_LOG_TEXT = 12000;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions', 'sourceMaterial'],
  properties: {
    sourceMaterial: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'questionType',
          'question',
          'marks',
          'commandWord',
          'isCalculation',
          'options',
          'correctOption',
          'markScheme',
          'modelAnswer',
          'skillsAssessed',
          'figureUrl',
          'sourceTitle',
          'sourceUrl',
          'plotSpec',
        ],
        properties: {
          questionType: { type: 'string', enum: ['open', 'mcq', 'plot'] },
          question: { type: 'string' },
          marks: { type: 'number' },
          commandWord: { type: 'string' },
          isCalculation: { type: 'boolean' },
          options: {
            type: 'array',
            items: { type: 'string' },
          },
          correctOption: { type: 'string', enum: ['', 'A', 'B', 'C', 'D'] },
          markScheme: {
            type: 'array',
            items: { type: 'string' },
          },
          modelAnswer: { type: 'string' },
          skillsAssessed: {
            type: 'array',
            items: { type: 'string' },
          },
          figureUrl: { type: 'string' },
          sourceTitle: { type: 'string' },
          sourceUrl: { type: 'string' },
          plotSpec: PLOT_SPEC_JSON_SCHEMA,
        },
      },
    },
  },
};

const clampQuestions = (n?: number) => clampCount(n, MIN_QUESTIONS, MAX_QUESTIONS, 6);

const parseMarkValue = (value: unknown) => {
  const numberValue =
    typeof value === 'string'
      ? Number(value.match(/\d+/)?.[0] || Number.NaN)
      : Number(value);
  if (!Number.isFinite(numberValue)) return null;
  const integerValue = Math.floor(numberValue);
  if (integerValue < MIN_MARK_VALUE || integerValue > MAX_MARK_VALUE) return null;
  return integerValue;
};

const readString = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
};

const readUnknown = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
};

const coerceGeneratedQuestions = (value: unknown): GeneratedExamQuestions | null => {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    return { questions: value as ExamQuestion[] };
  }
  const direct = value as { questions?: unknown; question?: unknown };
  const sourceMaterial = typeof (value as { sourceMaterial?: unknown }).sourceMaterial === 'string'
    ? (value as { sourceMaterial: string }).sourceMaterial
    : '';
  if (Array.isArray(direct.questions)) {
    return { questions: direct.questions as ExamQuestion[], sourceMaterial };
  }
  if (direct.question && typeof direct.question === 'object') {
    return { questions: [direct.question as ExamQuestion], sourceMaterial };
  }
  const nestedCandidates = Object.values(value as Record<string, unknown>);
  for (const candidate of nestedCandidates) {
    if (candidate && typeof candidate === 'object') {
      if (Array.isArray(candidate)) {
        return { questions: candidate as ExamQuestion[] };
      }
      const nested = candidate as { questions?: unknown; sourceMaterial?: unknown };
      if (Array.isArray(nested.questions)) {
        return {
          questions: nested.questions as ExamQuestion[],
          sourceMaterial: typeof nested.sourceMaterial === 'string' ? nested.sourceMaterial : sourceMaterial,
        };
      }
    }
  }
  return null;
};

const extractJson = (rawText: string): GeneratedExamQuestions | null =>
  extractJsonWithCoercer(rawText, coerceGeneratedQuestions);

const tryExtractFromUnknown = (value: unknown): GeneratedExamQuestions | null => {
  return tryExtractWithCoercer(value, coerceGeneratedQuestions, extractJson);
};

const extractQuestionsFromResponsesBody = (body: OpenAIResponseBody): GeneratedExamQuestions | null => {
  return extractFromResponsesBody(body, coerceGeneratedQuestions, extractJson);
};

const truncateForLog = (value: string) =>
  value.length > MAX_AI_RESPONSE_LOG_TEXT
    ? `${value.slice(0, MAX_AI_RESPONSE_LOG_TEXT)}... [truncated ${value.length - MAX_AI_RESPONSE_LOG_TEXT} chars]`
    : value;

const logInvalidQuestionJson = (source: string, payload: unknown) => {
  try {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    console.error(`[generate-questions] AI response was not valid question JSON (${source})`, truncateForLog(serialized || ''));
  } catch (err) {
    console.error(`[generate-questions] AI response was not valid question JSON (${source})`, payload, err);
  }
};

const normalizePayload = (raw: GenerateQuestionsPayload) => {
  const topic = txt(raw.topic || '', 200);
  const subtopic = txt(raw.subtopic || '', 200);
  const learningObjective = txt(raw.learningObjective || '', 300);
  const subject = txt((raw.subject || '').toLowerCase(), 60);
  const requestedAllowPlot = raw.allowPlot !== false;

  return {
    topic,
    subtopic,
    learningObjective,
    paper: txt(raw.paper || '', 30),
    subject,
    prompt: txt(raw.prompt || '', 2000),
    examBoard: normalizeBoard(raw.examBoard),
    examType: normalizeExamType(raw.examType),
    specification: txt(raw.specification || '', 280),
    figureUrl: sanitizeFigureUrl(raw.figureUrl || ''),
    questionCount: clampQuestions(raw.questionCount),
    allowMcq: raw.allowMcq !== false,
    allowCalculation: Boolean(raw.allowCalculation),
    // Gated server-side: the client flag is a request, not authority — only relevant
    // subject/topic/subtopic/learningObjective combinations may ever request plot questions.
    allowPlot: requestedAllowPlot && isChartPlottingTopic(subject, topic, subtopic, learningObjective),
    useOnlineResources: raw.useOnlineResources !== false,
  };
};

const textFromUnknown = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  return readString(record, [
    'text',
    'content',
    'point',
    'criterion',
    'description',
    'answer',
    'option',
    'value',
    'label',
    'title',
  ]);
};

const normalizeStringList = (value: unknown, subject: string, maxItems: number, maxLength: number) => {
  const values =
    Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/\n+|(?:^|\s)(?=\d+\.\s)/).filter(Boolean)
        : value && typeof value === 'object'
          ? Object.values(value as Record<string, unknown>)
        : [];

  return values
    .map((item) => normalizeMathNotation(safe(textFromUnknown(item)), subject))
    .map((item) => txt(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
};

const normalizeOptions = (value: unknown, subject: string, record?: Record<string, unknown>) => {
  const optionRecordValues = record
    ? ['optionA', 'optionB', 'optionC', 'optionD', 'A', 'B', 'C', 'D'].map((key) => record[key]).filter((item) => item !== undefined)
    : [];
  const values = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value as Record<string, unknown>)
      : optionRecordValues;
  if (!Array.isArray(values)) return [];

  const options = values
    .map((item) => txt(normalizeMathNotation(safe(textFromUnknown(item)), subject), 260))
    .map((item) => item.replace(/^[A-D][).\s:-]+/i, '').trim())
    .filter(Boolean)
    .slice(0, 4);
  const unique = new Set(options.map((option) => option.toLowerCase()));
  return unique.size === options.length ? options : [];
};

const inferCommandWord = (question: string, fallback: string) => {
  if (fallback) return fallback;
  const firstWord = question.match(/[A-Za-z]+/)?.[0] || '';
  return firstWord || 'Answer';
};

const normalizeQuestionType = (value: unknown, allowMcq: boolean, allowPlot: boolean, options: string[], answerLike: unknown): QuestionType => {
  const cleaned = String(value || '').toLowerCase();
  if (allowPlot && /\bplot\b/.test(cleaned)) return 'plot';
  if (allowMcq && /\b(mcq|multiple[-\s]?choice|multiple_choice|choice)\b/.test(cleaned)) return 'mcq';
  if (allowMcq && options.length >= 3 && options.length <= 4 && normalizeCorrectOption(answerLike, options)) return 'mcq';
  return 'open';
};

const normalizeCorrectOption = (value: unknown, options: string[] = []) => {
  const text = String(value || '').trim().toUpperCase();
  const direct = text.match(/^[A-D]$/)?.[0];
  if (direct) return direct as CorrectOption;
  const embedded = text.match(/\b([A-D])\b/)?.[1];
  if (embedded) return embedded as CorrectOption;

  const normalizedText = text.toLowerCase();
  const optionIndex = options.findIndex((option) => option.toLowerCase() === normalizedText);
  return (optionIndex >= 0 ? ['A', 'B', 'C', 'D'][optionIndex] : '') as CorrectOption;
};

const inferMarks = (record: Record<string, unknown>, questionText: string, questionType: QuestionType) => {
  const parsed = parseMarkValue(readUnknown(record, ['marks', 'mark', 'markValue', 'mark_value', 'maxMarks', 'max_marks', 'totalMarks', 'total_marks', 'points', 'score']));
  if (parsed !== null) return parsed;
  if (questionType === 'mcq') return 1;

  const text = `${questionText} ${readString(record, ['commandWord', 'command_word', 'command'])}`.toLowerCase();
  if (/\b(evaluate|assess|justify|discuss|to what extent|recommend)\b/.test(text)) return 9;
  if (/\b(analyse|analyze|explain why|compare)\b/.test(text)) return 6;
  if (/\b(explain|describe)\b/.test(text)) return 4;
  if (/\b(state|identify|give|name|define|list)\b/.test(text)) return 2;
  return 4;
};

const getQuestionFingerprint = (question: ExamQuestion) => `${question.marks}:${question.question.toLowerCase()}`;

const getSourceMaterialFromRawItem = (value: unknown, payload: ReturnType<typeof normalizePayload>) => {
  if (payload.subject !== 'english language' || !value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const sourceText = readString(record, [
    'sourceMaterial',
    'source_material',
    'source',
    'extract',
    'sourceA',
    'source_a',
    'sourceB',
    'source_b',
    'text',
    'content',
  ]);
  if (!sourceText || !/\bSource\s+[AB]\b/i.test(sourceText)) return '';

  const hasQuestionShape =
    readString(record, ['question', 'questionText', 'question_text', 'prompt']).trim().length > 0 ||
    readUnknown(record, ['marks', 'mark', 'maxMarks', 'questionType', 'question_type']) !== undefined;

  return hasQuestionShape ? '' : txt(normalizeMathNotation(safe(sourceText), payload.subject), 12000);
};

const normalizeQuestion = (
  question: ExamQuestion,
  payload: ReturnType<typeof normalizePayload>,
  figureUrls: string[]
): ExamQuestion | null => {
  if (!question || typeof question !== 'object') return null;
  const record = question as unknown as Record<string, unknown>;
  const rawQuestion = readString(record, ['question', 'questionText', 'question_text', 'prompt', 'text']);
  const questionText = normalizeMathNotation(safe(rawQuestion.replace(/^question\s*[:\-]\s*/i, '')), payload.subject);
  const rawAnswer = readString(record, ['modelAnswer', 'model_answer', 'answer', 'correctAnswer', 'correct_answer', 'explanation', 'rationale']);
  const tentativeOptions = normalizeOptions(readUnknown(record, ['options', 'choices', 'answers']), payload.subject, record);
  const answerLike = readUnknown(record, ['correctOption', 'correct_option', 'answer', 'correctAnswer', 'correct_answer']);
  const questionType = normalizeQuestionType(readUnknown(record, ['questionType', 'question_type', 'type', 'format']), payload.allowMcq, payload.allowPlot, tentativeOptions, answerLike);
  const plotSpec = questionType === 'plot' ? normalizePlotSpec(readUnknown(record, ['plotSpec', 'plot_spec'])) : null;
  const marks = inferMarks(record, questionText, questionType);
  const markScheme = normalizeStringList(
    readUnknown(record, ['markScheme', 'mark_scheme', 'markingPoints', 'marking_points', 'markSchemePoints', 'mark_scheme_points']),
    payload.subject,
    10,
    320
  );
  const skillsAssessed = normalizeStringList(
    readUnknown(record, ['skillsAssessed', 'skills_assessed', 'skills', 'assessmentObjectives', 'assessment_objectives']),
    payload.subject,
    6,
    80
  );
  const options = questionType === 'mcq' ? tentativeOptions : [];
  const correctOption = normalizeCorrectOption(answerLike, options);
  const correctOptionIndex = ['A', 'B', 'C', 'D'].indexOf(correctOption);
  const correctOptionText = correctOptionIndex >= 0 ? options[correctOptionIndex] : '';
  const answerFromMarkScheme = markScheme.length > 0 ? `A strong answer should include: ${markScheme.join(' ')}` : '';
  const modelAnswer = normalizeMathNotation(
    safe(rawAnswer || (correctOptionText ? `Correct answer: ${correctOption} - ${correctOptionText}` : answerFromMarkScheme)),
    payload.subject
  );
  const isCalculation = Boolean(readUnknown(record, ['isCalculation', 'is_calculation', 'calculation'])) && payload.allowCalculation;
  const repairedMarkScheme =
    markScheme.length > 0
      ? markScheme
      : modelAnswer
        ? questionType === 'mcq'
          ? [`Award ${marks} mark(s) for selecting the correct option.`, modelAnswer]
          : [modelAnswer]
        : [];

  const normalized: ExamQuestion = {
    questionType,
    question: txt(questionText, payload.subject === 'english language' ? 9000 : 2600),
    marks,
    commandWord: txt(safe(inferCommandWord(questionText, readString(record, ['commandWord', 'command_word', 'command']))), 80),
    isCalculation,
    options,
    correctOption: questionType === 'mcq' ? correctOption : '',
    markScheme: repairedMarkScheme,
    modelAnswer: txt(modelAnswer, 1400),
    skillsAssessed: skillsAssessed.length > 0 ? skillsAssessed : ['Exam technique'],
    figureUrl: (() => {
      const candidate = sanitizeFigureUrl(readString(record, ['figureUrl', 'figure_url', 'imageUrl', 'image_url']));
      return candidate && figureUrls.includes(candidate) ? candidate : '';
    })(),
    sourceTitle: cleanText(readString(record, ['sourceTitle', 'source_title', 'source', 'citationTitle', 'citation_title']), 160),
    sourceUrl: sanitizeFigureUrl(readString(record, ['sourceUrl', 'source_url', 'url', 'citationUrl', 'citation_url'])),
    plotSpec,
  };

  if (!normalized.question || !normalized.commandWord || normalized.markScheme.length === 0 || !normalized.modelAnswer) {
    return null;
  }

  if (normalized.questionType === 'plot' && !normalized.plotSpec) {
    return {
      ...normalized,
      questionType: 'open',
      question: txt(
        `${normalized.question}\n\n(Chart data could not be structured for interactive plotting; describe/sketch the answer instead.)`,
        payload.subject === 'english language' ? 9000 : 2600
      ),
      plotSpec: null,
    };
  }

  if (normalized.questionType === 'mcq') {
    const validCorrectOptions = ['A', 'B', 'C', 'D'].slice(0, normalized.options.length);
    if (normalized.options.length < 3 || normalized.options.length > 4 || !validCorrectOptions.includes(normalized.correctOption)) {
      const optionText = normalized.options.length > 0
        ? `\n\nOptions referenced by the source question: ${normalized.options.map((option, index) => `${['A', 'B', 'C', 'D'][index]}. ${option}`).join(' ')}`
        : '';
      return {
        ...normalized,
        questionType: 'open',
        question: txt(`${normalized.question}${optionText}`, payload.subject === 'english language' ? 9000 : 900),
        options: [],
        correctOption: '',
        markScheme: normalized.markScheme.length > 0 ? normalized.markScheme : [normalized.modelAnswer],
      };
    }
  }

  return normalized;
};

const referencesFigure = (text: string) => /\bfigure\b/i.test(text);

const applyFigureReferences = (questions: ExamQuestion[], figureUrls: string[]) => {
  if (figureUrls.length === 0) return { questions, missingFigureReference: false };

  let pointer = 0;
  const next = questions.map((question) => {
    if (!referencesFigure(question.question) || question.figureUrl) return question;
    const figureUrl = figureUrls[Math.min(pointer, figureUrls.length - 1)];
    pointer += 1;
    return { ...question, figureUrl };
  });

  return { questions: next, missingFigureReference: false };
};

const getEnglishLanguagePaper = (payload: ReturnType<typeof normalizePayload>) => {
  if (payload.subject !== 'english language') return null;
  const combined = `${payload.topic} ${payload.prompt} ${payload.specification}`.toLowerCase();
  if (/\bpaper\s*2\b/.test(combined)) return 'paper2';
  return 'paper1';
};

const getEnglishLanguageInstructions = (payload: ReturnType<typeof normalizePayload>) => {
  const paper = getEnglishLanguagePaper(payload);
  if (!paper) return null;

  if (paper === 'paper1') {
    return [
      'AQA GCSE English Language Paper 1 only. Generate exactly 8 questions; ignore requested count.',
      'Create one original fiction extract of 550-750 words. Put the full extract only in top-level sourceMaterial under "Source A". Do not include the extract inside any question. Do not use copyrighted text.',
      'Questions 1-4: each is questionType="mcq", 1 mark, exactly 3 options A-C, based only on the first paragraph of Source A.',
      'Question 5: open, 8 marks, analyse how language devices in the second paragraph create one named effect.',
      'Question 6: open, 8 marks, analyse how structural devices across the whole extract create one named effect.',
      'Question 7: open, 20 marks, evaluate a two-part student statement about the extract. The statement must invite agreement/disagreement about both language and structure.',
      'Question 8: open, 40 marks, creative writing. Ask the student to write a story whose prompt is vaguely similar to Source A, not a continuation. Mark scheme must split 24 content/organisation and 16 technical accuracy.',
      'For each open reading question, include concise markScheme points and a full-mark modelAnswer. For the writing task, modelAnswer should be a planning outline plus success criteria, not a full story.',
      'Set sourceTitle="AI-created AQA Paper 1 fiction extract" and sourceUrl="".',
    ].join(' ');
  }

  return [
    'AQA GCSE English Language Paper 2 only. Generate exactly 5 questions; ignore requested count.',
    'Create two original linked unseen sources of 350-500 words each: one 20th/21st century non-fiction and one 19th century..... non-fiction with contrasting viewpoints on the same issue. Put both full sources only in top-level sourceMaterial under "Source A" and "Source B". Do not include the sources inside any question. Do not use copyrighted text.',
    'Question 1: open, 4 marks, short retrieval/inference about Source A.',
    'Question 2: open, 8 marks, write a summary comparing differences between Source A and Source B.',
    'Question 3: open, 12 marks, analyse how the writer uses language in a named section of one source.',
    'Question 4: open, 16 marks, compare how the writers convey different viewpoints and perspectives across both sources.',
    'Question 5: open, 40 marks, write to present a viewpoint in a specified non-fiction form such as article, letter, speech or blog. Mark scheme must split 24 content/organisation and 16 technical accuracy.',
    'For each question, include concise markScheme points and a full-mark modelAnswer. For the writing task, modelAnswer should be a planning outline plus success criteria, not a full article.',
    'Set sourceTitle="AI-created AQA Paper 2 linked sources" and sourceUrl="".',
  ].join(' ');
};

const buildPrompt = (
  payload: ReturnType<typeof normalizePayload>,
  figureUrls: string[],
  useWebSearch: boolean
) => {
  const englishLanguageInstructions = getEnglishLanguageInstructions(payload);
  const resourceInstruction = useWebSearch
    ? 'Search for official exam-board resources (spec/sample papers/mark schemes) to pick realistic mark values. Set sourceTitle+sourceUrl per question (empty strings if unavailable).'
    : 'Use knowledge to pick realistic mark values. Leave sourceTitle/sourceUrl empty.';
  const formatInstruction = payload.allowMcq
    ? 'Mostly written-response; include MCQs only where exam-board style supports them.'
    : 'Written-response only. No MCQs.';
  const calcInstruction = payload.allowCalculation
    ? 'Calculation questions allowed where realistic.'
    : 'No calculations. isCalculation=false on every question.';
  const plotInstructions = payload.allowPlot
    ? [
        'plot: when (and only when) a question requires the student to physically draw/plot a chart, set questionType="plot" and populate plotSpec with exactly one non-null sub-object matching chartType; for every other question set plotSpec=null (all 8 sub-objects null).',
        'plot chartType="pie": give 2-8 categories with raw values; correctAngles = each value/total*360 rounded to the nearest whole degree, summing to exactly 360 (adjust the largest sector by the rounding remainder).',
        'plot chartType="bar": give 2-10 category labels with realistic correctValues; set yAxisMax comfortably above the largest value and yAxisStep to a clean gridline interval (1,2,5,10,20...).',
        'plot chartType="line": use ONLY for continuous data with a natural sequence x-axis (e.g. distance-time, temperature-time) that is read by joining consecutive points directly. NEVER use "line" for cumulative frequency -- that is always chartType="scatter" (see below), even though it is called a "cumulative frequency graph". For GCSE Science subjects (Physics/Chemistry/Biology) where the practical skill is plotting points then drawing a line/curve of best fit (e.g. cooling curves, extension-vs-force, rate-of-reaction, potential-difference-vs-current): set requiresBestFit=true and choose fitShape genuinely from the relationship (e.g. Hooke\'s law extension-vs-force → "line"; cooling curve or rate of reaction → "curve"), explaining why in fitDescription. For GCSE Maths or any other line graph with no fit judgement: set requiresBestFit=false, fitShape="none", fitDescription="".',
        'plot chartType="scatter": decide from the underlying relationship whether it is genuinely linear or inherently curved (many Biology rate/growth/enzyme-activity data curve; simple proportional relationships are linear) and set fitShape accordingly, stating why in fitDescription. Cumulative frequency graphs/diagrams/curves are ALWAYS chartType="scatter" (never "line"): connectPoints=true, fitShape="curve" (cumulative frequency curves are smooth, never straight segments), givenPoints = the (upper class boundary, cumulative frequency) pairs, xAxisMax/yAxisMax comfortably above the largest boundary/cumulative frequency.',
        'plot chartType="histogram": ALWAYS use unequal class widths (the specific GCSE skill being tested); correctFrequencyDensity = frequency / (classEnd-classStart) for every bar, never plain frequency.',
        'plot chartType="frequencyPolygon": give class boundaries and frequencies (not density); the correct point per class is (midpoint, frequency), joined by straight lines between consecutive midpoints.',
        'plot chartType="stemLeaf": give 5-30 raw values for one stem-and-leaf plot; correctRows leaves sorted ascending within each stem; key reads like "5 | 2 means 52".',
        'plot chartType="boxPlot": give raw data or a description the student can compute from; correctValues must be a valid 5-number summary (min ≤ lowerQuartile ≤ median ≤ upperQuartile ≤ max).',
        'Every plot question: state clearly in the question text (markdown, with a table for raw data) what must be plotted, and set marks to the number of gradeable features (e.g. box plot = 5, scatter = points + 1 for the fit-shape judgement).',
        'markScheme for a plot question: one bullet per gradeable feature. modelAnswer: describe the fully-correct chart in words, since it cannot contain an image.',
      ].join(' ')
    : 'Never set questionType="plot"; leave plotSpec=null on every question.';

  const system = [
    `Generate ${englishLanguageInstructions ? 'the required fixed-paper set' : payload.questionCount} exam practice questions as strict JSON. Board:${payload.examBoard} Type:${payload.examType} Subject:${payload.subject}.`,
    payload.specification ? `Spec: ${payload.specification}` : '',
    payload.allowPlot ? plotInstructions : '',
    englishLanguageInstructions,
    resourceInstruction,
    formatInstruction,
    calcInstruction,
    'MCQ: questionType="mcq", 3 or 4 options (no letters in text), correctOption=A/B/C/D as applicable, modelAnswer explains correct option.',
    'Open: questionType="open", options=[], correctOption="".',
    payload.allowPlot ? '' : plotInstructions,
    'commandWord: the exact exam command word (e.g. Calculate/Explain/Evaluate/State). Never empty.',
    'isCalculation: true only if numeric calculation required.',
    'modelAnswer: full response earning full marks. Never empty.',
    'skillsAssessed: ≥1 item, e.g. "AO1 Knowledge", "AO2 Application".',
    'markScheme: string array, ≥1 item, one mark point per element. Clear enough for AI marking.',
    'figureUrl: use provided URLs where relevant, else "".',
    figureUrls.length > 0 ? '' : 'Do not invent figureUrls.',
    'Use GFM Markdown in strings. No raw HTML.',
    'Math: inline \\\\(...\\\\), display \\\\[...\\\\]. Double-escape backslashes in JSON. Always group: x^{2} not x^2.',
    'sourceMaterial: use only for separate extracts/sources needed to answer the questions. Empty string for ordinary practice.',
    'When a question involves a data set, present it as a markdown table (| col | col |) inside the question text so it renders correctly.',
    'Keep all text fields concise: question≤2 sentences, markScheme items≤15 words each, modelAnswer≤40 words, skillsAssessed≤1 item.',
    'Return JSON only. Match schema exactly.',
  ]
    .filter(Boolean)
    .join(' ');

  const user = [
    payload.topic
      ? `Topic: ${payload.topic}`
      : `No specific topic given. Generalise across ${payload.paper ? `the topics assessed on ${payload.paper} of the specification` : 'the whole specification'}, choosing a well-rounded, representative spread of topics.`,
    payload.subtopic ? `Subtopic focus: ${payload.subtopic}. Concentrate the questions on this subtopic rather than the whole topic.` : '',
    payload.learningObjective ? `Learning objective: ${payload.learningObjective}` : '',
    payload.learningObjective && isDataAnalysisObjective(payload.learningObjective)
      ? 'This is a data-analysis focused session: at least half of the generated questions must present a small, realistic data set as a markdown table (| col | col |) that the student must read, calculate from, or interpret (e.g. rates, means, percentages, trends). Do not make every question purely descriptive or recall-based.'
      : '',
    payload.allowPlot
      ? `MANDATORY: exactly ${Math.max(1, Math.min(2, Math.round(payload.questionCount * 0.2)))} of the ${payload.questionCount} questions in this set MUST have questionType="plot" with a fully populated plotSpec — this is a hard requirement, not optional. Choose the chart type genuinely implied by the topic/subtopic (e.g. "Scatter graphs and lines of best fit" → chartType="scatter"; "histograms with unequal class widths" → chartType="histogram"; "box plots" → chartType="boxPlot"). Do not skip this requirement.`
      : '',
    payload.paper ? `${payload.paper}. Only include content that is assessed on this paper of the specification, not content exclusive to another paper.` : '',
    payload.prompt ? `Prompt requirements: ${payload.prompt}` : '',
    figureUrls.length > 0 ? `Figure URLs:\n${figureUrls.map((url, i) => `${i + 1}. ${url}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, user };
};

const buildResponsesBody = (
  config: ReturnType<typeof getAIConfig>,
  system: string,
  user: string,
  useWebSearch: boolean
) => {
  const body: Record<string, unknown> = {
    model: config.model,
    temperature: 0.7,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      { role: 'user', content: [{ type: 'input_text', text: user }] },
    ],
    text: { format: { type: 'json_schema', name: 'mixed_exam_questions', schema: SCHEMA, strict: true } },
  };

  body.max_output_tokens = GENERATION_MAX_OUTPUT_TOKENS;
  if (config.isOpenRouter && config.isGemini) {
    body.thinking = { type: 'disabled' };
  }

  if (useWebSearch) {
    body.tools = config.isOpenRouter
      ? [
          {
            type: 'openrouter:web_search',
            parameters: {
              max_results: 2,
              max_total_results: 2,
              search_context_size: 'low',
              user_location: { type: 'approximate', country: 'GB', timezone: 'Europe/London' },
            },
          },
        ]
      : [
          {
            type: 'web_search',
            user_location: { type: 'approximate', country: 'GB', timezone: 'Europe/London' },
          },
        ];
    body.tool_choice = 'auto';
    if (!config.isOpenRouter) {
      body.include = ['web_search_call.action.sources'];
    }
  }

  return body;
};

const requestResponses = async (
  config: ReturnType<typeof getAIConfig>,
  system: string,
  user: string,
  useWebSearch: boolean
) => {
  const commonHeaders = buildAIHeaders(config);
  const response = await fetch(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify(buildResponsesBody(config, system, user, useWebSearch)),
  });

  if (!response.ok) {
    return { parsed: null, errorText: await response.text() };
  }

  const body = (await response.json()) as OpenAIResponseBody;
  const parsed = extractQuestionsFromResponsesBody(body);
  if (!parsed) {
    logInvalidQuestionJson('/responses', body);
    throw new Error('AI response was not valid question JSON.');
  }
  return { parsed, errorText: '' };
};

const requestChatFallback = async (
  config: ReturnType<typeof getAIConfig>,
  system: string,
  user: string,
  responsesErrorText: string,
  useWebSearch: boolean
) => {
  const commonHeaders = buildAIHeaders(config);
  const tools =
    useWebSearch && config.isOpenRouter
      ? [
          {
            type: 'openrouter:web_search',
            parameters: {
              max_results: 2,
              max_total_results: 2,
              search_context_size: 'low',
              user_location: { type: 'approximate', country: 'GB', timezone: 'Europe/London' },
            },
          },
        ]
      : undefined;

  const chatResponse = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      model: config.model,
      temperature: 0.7,
      max_tokens: GENERATION_MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      ...(tools ? { tools, tool_choice: 'auto' } : {}),
      ...(config.supportsJsonSchema
        ? { response_format: { type: 'json_schema', json_schema: { name: 'mixed_exam_questions', schema: SCHEMA, strict: true } } }
        : { response_format: { type: 'json_object' } }),
    }),
  });

  if (!chatResponse.ok) {
    const chatErrorText = await chatResponse.text();
    throw new Error(`AI request failed. /responses: ${responsesErrorText} | /chat/completions: ${chatErrorText}`);
  }

  const chatBody = (await chatResponse.json()) as ChatCompletionsResponseBody;
  const firstMessage = chatBody.choices?.[0]?.message;
  const parsedField = tryExtractFromUnknown(firstMessage?.parsed);
  if (parsedField) return parsedField;

  const content = firstMessage?.content;
  const textContent =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((part) => (part?.type === 'text' ? part.text || '' : ''))
            .join('\n')
        : '';
  const parsed = extractJson(textContent);
  if (!parsed) {
    logInvalidQuestionJson('/chat/completions', {
      parsed: firstMessage?.parsed,
      content: textContent,
      rawMessage: firstMessage,
    });
    throw new Error('AI chat/completions response was not valid question JSON.');
  }
  return parsed;
};

const aiGenerate = async (
  payload: ReturnType<typeof normalizePayload>,
  figureUrls: string[]
): Promise<AIQuestionResult> => {
  const config = getAIConfig();
  const canUseWebSearch =
    payload.useOnlineResources &&
    ((config.isOpenAIHosted && config.baseUrl === OPENAI_DEFAULT_BASE_URL) || config.isOpenRouter);
  const { system, user } = buildPrompt(payload, figureUrls, canUseWebSearch);

  // OpenRouter: skip /responses (unsupported) and go straight to chat
  if (config.isOpenRouter) {
    if (canUseWebSearch) {
      try {
        const generated = await requestChatFallback(config, system, user, '', true);
        return { generated, usedOnlineResources: true, onlineLookupFailed: false, onlineLookupReason: '' };
      } catch {
        const fallbackPrompt = buildPrompt(payload, figureUrls, false);
        const generated = await requestChatFallback(config, fallbackPrompt.system, fallbackPrompt.user, '', false);
        return { generated, usedOnlineResources: false, onlineLookupFailed: true, onlineLookupReason: 'Web search failed.' };
      }
    }
    const generated = await requestChatFallback(config, system, user, '', false);
    return { generated, usedOnlineResources: false, onlineLookupFailed: false, onlineLookupReason: '' };
  }

  if (canUseWebSearch) {
    const webResponse = await requestResponses(config, system, user, true);
    if (webResponse.parsed) {
      return { generated: webResponse.parsed, usedOnlineResources: true, onlineLookupFailed: false, onlineLookupReason: '' };
    }
    const fallbackPrompt = buildPrompt(payload, figureUrls, false);
    const fallbackResponse = await requestResponses(config, fallbackPrompt.system, fallbackPrompt.user, false);
    if (fallbackResponse.parsed) {
      return { generated: fallbackResponse.parsed, usedOnlineResources: false, onlineLookupFailed: true, onlineLookupReason: txt(webResponse.errorText || 'Provider rejected web search.', 300) };
    }
    const chatGenerated = await requestChatFallback(config, fallbackPrompt.system, fallbackPrompt.user, fallbackResponse.errorText || webResponse.errorText, false);
    return { generated: chatGenerated, usedOnlineResources: false, onlineLookupFailed: true, onlineLookupReason: txt(webResponse.errorText || 'Provider rejected web search.', 300) };
  }

  const response = await requestResponses(config, system, user, false);
  if (response.parsed) {
    return { generated: response.parsed, usedOnlineResources: false, onlineLookupFailed: false, onlineLookupReason: '' };
  }
  const chatGenerated = await requestChatFallback(config, system, user, response.errorText, false);
  return { generated: chatGenerated, usedOnlineResources: false, onlineLookupFailed: false, onlineLookupReason: '' };
};

const aiBackfillQuestions = async (
  payload: ReturnType<typeof normalizePayload>,
  figureUrls: string[],
  existingQuestions: ExamQuestion[],
  missingCount: number
) => {
  const config = getAIConfig();
  const backfillPayload = { ...payload, questionCount: missingCount, useOnlineResources: false };
  const { system, user } = buildPrompt(backfillPayload, figureUrls, false);
  const avoidList = existingQuestions.map((question, index) => ({
    index: index + 1,
    question: txt(question.question, 220),
    marks: question.marks,
    questionType: question.questionType,
  }));
  const backfillUser = [
    user,
    'Existing usable questions to avoid repeating:',
    JSON.stringify(avoidList),
    `Generate exactly ${missingCount} additional usable question(s). Each item must include usable question text, marks, markScheme, modelAnswer, and MCQ option data when questionType is "mcq".`,
  ].join('\n\n');

  const responsesResult = await requestResponses(config, system, backfillUser, false);
  if (responsesResult.parsed) return responsesResult.parsed;
  return requestChatFallback(config, system, backfillUser, responsesResult.errorText, false);
};

const appendUniqueQuestions = (
  target: ExamQuestion[],
  seen: Set<string>,
  rawQuestions: ExamQuestion[],
  payload: ReturnType<typeof normalizePayload>,
  sourceMaterialItems: string[],
  figureUrls: string[]
) => {
  let malformedCount = 0;

  for (const rawQuestion of rawQuestions) {
    if (target.length >= payload.questionCount) break;
    const sourceMaterial = getSourceMaterialFromRawItem(rawQuestion, payload);
    if (sourceMaterial) {
      sourceMaterialItems.push(sourceMaterial);
      continue;
    }

    const question = normalizeQuestion(rawQuestion, payload, figureUrls);
    if (!question) {
      malformedCount += 1;
      continue;
    }

    const key = getQuestionFingerprint(question);
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(question);
  }

  return malformedCount;
};

const getSources = (questions: ExamQuestion[]): SourceReference[] => {
  const sources: SourceReference[] = [];
  const seen = new Set<string>();

  for (const question of questions) {
    if (!question.sourceUrl || seen.has(question.sourceUrl)) continue;
    seen.add(question.sourceUrl);
    sources.push({
      title: question.sourceTitle || question.sourceUrl,
      url: question.sourceUrl,
    });
  }

  return sources.slice(0, 8);
};

async function validateTopicWithAI(
  payload: ReturnType<typeof normalizePayload>,
  config: ReturnType<typeof getAIConfig>
): Promise<{ valid: boolean; reason: string }> {
  const { topic, subject, examBoard, examType, specification } = payload;

  const specLine = specification ? `Specification / option: ${specification}.\n` : '';
  const prompt =
    `UK exam board expert. Decide whether the student's topic is genuinely assessable in this qualification.\n\n` +
    `Subject: ${subject}\nExam board: ${examBoard}\nLevel: ${examType}\n${specLine}` +
    `Student topic: "${topic}"\n\n` +
    `Rules:\n` +
    `- ACCEPT topics that directly appear in, or are a clear sub-topic of, this specification.\n` +
    `- ACCEPT borderline or ambiguous topics (give benefit of the doubt).\n` +
    `- REJECT only when the topic clearly belongs to a different subject, a different exam level, or is not assessable by this board.\n\n` +
    `Reply with JSON only, no prose: {"valid": true, "reason": ""} or {"valid": false, "reason": "<one concise sentence>"}`;

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: buildAIHeaders(config),
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 80,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) return { valid: true, reason: '' }; // fail open

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) return { valid: true, reason: '' };

    const parsed = JSON.parse(content) as { valid?: boolean; reason?: string };
    const isValid = parsed.valid !== false;

    if (isValid) return { valid: true, reason: '' };

    const aiReason = typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim() : '';
    const examBoardLabel = examBoard ? examBoard.toUpperCase() : 'this exam board';
    const examTypeLabel = examType || 'this level';
    const fallbackReason =
      `"${topic}" doesn't appear to be part of ${examBoardLabel} ${examTypeLabel} ${subject}. ` +
      `Check your qualification settings or try a topic from your specification.`;

    return { valid: false, reason: aiReason || fallbackReason };
  } catch {
    return { valid: true, reason: '' }; // fail open on any error
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawBody = (await request.json()) as GenerateQuestionsPayload;
    const payload = normalizePayload(rawBody);

    if (!payload.examBoard || !SUPPORTED_EXAM_BOARDS.includes(payload.examBoard)) {
      return NextResponse.json({ error: 'Exam board must be one of: AQA, Edexcel, OCR.' }, { status: 400 });
    }
    if (!payload.examType || !SUPPORTED_EXAM_TYPES.includes(payload.examType)) {
      return NextResponse.json({ error: 'Exam type must be GCSE or A-Level.' }, { status: 400 });
    }
    if (!payload.subject || !SUPPORTED_SUBJECTS.includes(payload.subject as SupportedSubject)) {
      return NextResponse.json(
        { error: `Subject must be one of: ${SUPPORTED_SUBJECTS.join(', ')}.` },
        { status: 400 }
      );
    }
    if (payload.subject === 'english language' && payload.examBoard !== 'aqa') {
      return NextResponse.json({ error: 'English Language practice currently supports AQA only.' }, { status: 400 });
    }
    const englishLanguagePaper = getEnglishLanguagePaper(payload);
    if (!englishLanguagePaper && payload.topic) {
      const allowedTopics = getMajorTopicsForQualification({
        subject: payload.subject,
        examBoard: payload.examBoard,
        examType: payload.examType,
        specification: payload.specification,
      });
      const topicError = getQualificationTopicError(payload.topic, allowedTopics);
      if (topicError) {
        return NextResponse.json({ error: topicError }, { status: 400 });
      }
      const relevanceError = getTopicRelevanceError({
        topic: payload.topic,
        subject: payload.subject,
        examBoard: payload.examBoard,
        examType: payload.examType,
        specification: payload.specification,
      });
      if (relevanceError) {
        return NextResponse.json({ error: relevanceError }, { status: 400 });
      }
    }
    if (englishLanguagePaper) {
      payload.questionCount = englishLanguagePaper === 'paper1' ? 8 : 5;
      payload.allowMcq = englishLanguagePaper === 'paper1';
      payload.allowCalculation = false;
    }

    const config = getAIConfig();
    const missingKeyError = getMissingHostedKeyError(config);
    if (missingKeyError) {
      return NextResponse.json({ error: missingKeyError }, { status: 500 });
    }

    // AI spec validation — skip for English Language (fixed paper formats have their own logic)
    if (!englishLanguagePaper) {
      const specCheck = await validateTopicWithAI(payload, config);
      if (!specCheck.valid) {
        return NextResponse.json({ error: specCheck.reason }, { status: 400 });
      }
    }

    const figureUrls = dedupe([payload.figureUrl, ...extractFigureUrls(payload.prompt)].filter(Boolean)).slice(0, 8);
    const warnings: string[] = [];

    const aiResult = await aiGenerate(payload, figureUrls);
    if (aiResult.onlineLookupFailed) {
      warnings.push(
        `Online resource lookup was unavailable, so marks were chosen without live source lookup.${aiResult.onlineLookupReason ? ` ${aiResult.onlineLookupReason}` : ''}`
      );
    }

    const uniqueQuestions: ExamQuestion[] = [];
    const seen = new Set<string>();
    const rawQuestions = Array.isArray(aiResult.generated.questions) ? aiResult.generated.questions : [];
    const sourceMaterialItems: string[] = [];
    let malformedCount = appendUniqueQuestions(uniqueQuestions, seen, rawQuestions, payload, sourceMaterialItems, figureUrls);
    let totalRawQuestions = rawQuestions.length;

    if (uniqueQuestions.length < payload.questionCount) {
      try {
        const missingCount = payload.questionCount - uniqueQuestions.length;
        const backfillRaw = await aiBackfillQuestions(payload, figureUrls, uniqueQuestions, missingCount);
        const backfillQuestions = Array.isArray(backfillRaw.questions) ? backfillRaw.questions : [];
        totalRawQuestions += backfillQuestions.length;
        malformedCount += appendUniqueQuestions(uniqueQuestions, seen, backfillQuestions, payload, sourceMaterialItems, figureUrls);
      } catch {
        warnings.push('Replacement question generation could not complete.');
      }
    }

    if (uniqueQuestions.length === 0) {
      return NextResponse.json(
        {
          error:
            totalRawQuestions === 0
              ? 'AI did not return any exam-practice questions.'
              : `AI returned ${totalRawQuestions} question(s), but none included enough usable question text, marks, answer guidance, and MCQ option data.`,
        },
        { status: 502 }
      );
    }
    if (malformedCount > 0) {
      warnings.push(`Repaired the question set and discarded ${malformedCount} malformed item(s).`);
    }
    if (uniqueQuestions.length < payload.questionCount) {
      warnings.push(`Generated ${uniqueQuestions.length} unique questions out of requested ${payload.questionCount}.`);
    }

    const missingFigureReference = uniqueQuestions.some((question) => referencesFigure(question.question) && !question.figureUrl);
    const withFigures = applyFigureReferences(uniqueQuestions, figureUrls).questions;
    if (missingFigureReference && figureUrls.length === 0) {
      warnings.push('Some questions reference a figure, but no figure URL was provided.');
    }
    const sourceMaterial = txt(
      normalizeMathNotation(safe(aiResult.generated.sourceMaterial || sourceMaterialItems[0] || ''), payload.subject),
      12000
    );

    console.info('[generate-questions] Produced question set', {
      subject: payload.subject,
      examBoard: payload.examBoard,
      examType: payload.examType,
      specification: payload.specification,
      requestedQuestionCount: payload.questionCount,
      producedQuestionCount: withFigures.length,
      sourceMaterial,
      questions: withFigures,
      warnings,
    });

    return NextResponse.json({
      success: true,
      questionCount: withFigures.length,
      questions: withFigures,
      sourceMaterial,
      sources: getSources(withFigures),
      usedOnlineResources: aiResult.usedOnlineResources,
      warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate questions.';
    return NextResponse.json({ error: txt(message, MAX_AI_ERROR_TEXT) }, { status: 500 });
  }
}
