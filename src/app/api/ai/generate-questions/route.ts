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
import { normalizeMathNotation } from '@/lib/ai/math';
import { cleanText, dedupe, extractFigureUrls, MAX_AI_ERROR_TEXT, safe, sanitizeFigureUrl, txt } from '@/lib/ai/text';
import {
  clampCount,
  normalizeBoard,
  normalizeExamType,
  SUPPORTED_EXAM_BOARDS,
  SUPPORTED_EXAM_TYPES,
  SUPPORTED_SUBJECTS,
  type SupportedSubject,
} from '@/lib/ai/validation';

type QuestionType = 'open' | 'mcq';
type CorrectOption = '' | 'A' | 'B' | 'C' | 'D';

interface GenerateQuestionsPayload {
  topic?: string;
  subject?: string;
  prompt?: string;
  examBoard?: string;
  examType?: string;
  specification?: string;
  figureUrl?: string;
  questionCount?: number;
  allowMcq?: boolean;
  allowCalculation?: boolean;
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
};

type SourceReference = {
  title: string;
  url: string;
};

type GeneratedExamQuestions = {
  questions: ExamQuestion[];
};

type AIQuestionResult = {
  generated: GeneratedExamQuestions;
  usedOnlineResources: boolean;
  onlineLookupFailed: boolean;
};

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 20;
const MIN_MARK_VALUE = 1;
const MAX_MARK_VALUE = 30;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
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
        ],
        properties: {
          questionType: { type: 'string', enum: ['open', 'mcq'] },
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
        },
      },
    },
  },
};

const clampQuestions = (n?: number) => clampCount(n, MIN_QUESTIONS, MAX_QUESTIONS, 6);

const parseMarkValue = (value: unknown) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  const integerValue = Math.floor(numberValue);
  if (integerValue < MIN_MARK_VALUE || integerValue > MAX_MARK_VALUE) return null;
  return integerValue;
};

const coerceGeneratedQuestions = (value: unknown): GeneratedExamQuestions | null => {
  if (!value || typeof value !== 'object') return null;
  const direct = value as { questions?: unknown };
  if (Array.isArray(direct.questions)) {
    return { questions: direct.questions as ExamQuestion[] };
  }
  const nestedCandidates = Object.values(value as Record<string, unknown>);
  for (const candidate of nestedCandidates) {
    if (candidate && typeof candidate === 'object') {
      const nested = candidate as { questions?: unknown };
      if (Array.isArray(nested.questions)) {
        return { questions: nested.questions as ExamQuestion[] };
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

const normalizePayload = (raw: GenerateQuestionsPayload) => ({
  topic: txt(raw.topic || '', 200),
  subject: txt((raw.subject || '').toLowerCase(), 60),
  prompt: txt(raw.prompt || '', 2000),
  examBoard: normalizeBoard(raw.examBoard),
  examType: normalizeExamType(raw.examType),
  specification: txt(raw.specification || '', 280),
  figureUrl: sanitizeFigureUrl(raw.figureUrl || ''),
  questionCount: clampQuestions(raw.questionCount),
  allowMcq: raw.allowMcq !== false,
  allowCalculation: Boolean(raw.allowCalculation),
  useOnlineResources: raw.useOnlineResources !== false,
});

const normalizeStringList = (value: unknown, subject: string, maxItems: number, maxLength: number) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeMathNotation(safe(String(item || '')), subject))
    .map((item) => txt(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
};

const normalizeOptions = (value: unknown, subject: string) => {
  if (!Array.isArray(value)) return [];
  const options = value
    .map((item) => txt(normalizeMathNotation(safe(String(item || '')), subject), 260))
    .filter(Boolean)
    .slice(0, 4);
  const unique = new Set(options.map((option) => option.toLowerCase()));
  return unique.size === options.length ? options : [];
};

const normalizeQuestion = (
  question: ExamQuestion,
  payload: ReturnType<typeof normalizePayload>
): ExamQuestion | null => {
  const marks = parseMarkValue(question.marks);
  if (marks === null) return null;

  const questionType: QuestionType = question.questionType === 'mcq' && payload.allowMcq ? 'mcq' : 'open';
  const questionText = normalizeMathNotation(safe((question.question || '').replace(/^question\s*[:\-]\s*/i, '')), payload.subject);
  const modelAnswer = normalizeMathNotation(safe(question.modelAnswer || ''), payload.subject);
  const markScheme = normalizeStringList(question.markScheme, payload.subject, 10, 320);
  const skillsAssessed = normalizeStringList(question.skillsAssessed, payload.subject, 6, 80);
  const options = questionType === 'mcq' ? normalizeOptions(question.options, payload.subject) : [];
  const correctOption = txt((question.correctOption || '').toUpperCase(), 1) as CorrectOption;
  const isCalculation = Boolean(question.isCalculation) && payload.allowCalculation;

  const normalized: ExamQuestion = {
    questionType,
    question: txt(questionText, 900),
    marks,
    commandWord: txt(safe(question.commandWord || ''), 80),
    isCalculation,
    options,
    correctOption: questionType === 'mcq' ? correctOption : '',
    markScheme,
    modelAnswer: txt(modelAnswer, 1400),
    skillsAssessed,
    figureUrl: sanitizeFigureUrl(question.figureUrl || ''),
    sourceTitle: cleanText(question.sourceTitle || '', 160),
    sourceUrl: sanitizeFigureUrl(question.sourceUrl || ''),
  };

  if (!normalized.question || !normalized.commandWord || normalized.markScheme.length === 0 || !normalized.modelAnswer) {
    return null;
  }

  if (normalized.questionType === 'mcq') {
    if (normalized.options.length !== 4 || !['A', 'B', 'C', 'D'].includes(normalized.correctOption)) return null;
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

const buildPrompt = (
  payload: ReturnType<typeof normalizePayload>,
  figureUrls: string[],
  useWebSearch: boolean
) => {
  const formatInstruction = payload.allowMcq
    ? 'You may include a small number of MCQs where that matches exam-board style. Most questions should still be written-response unless online resources show MCQs are common for this topic.'
    : 'Generate only written-response questions. Do not generate MCQs.';
  const calculationInstruction = payload.allowCalculation
    ? 'Calculation questions are allowed where the exam-board resources or topic make them realistic.'
    : 'Do not require calculation. Set isCalculation false for every question.';
  const resourceInstruction = useWebSearch
    ? [
        'Use online search before choosing question marks.',
        'Look for current or recent official exam-board/specification/assessment-guide/sample-assessment/question-paper/mark-scheme resources for this subject, exam board, exam type, and topic.',
        'Choose each question mark value from the kinds of marks those resources use. Do not rely on a fixed default list.',
        'For each question, include the most relevant sourceTitle and sourceUrl you used. If a source is unavailable for one question, use empty strings.',
      ].join('\n')
    : [
        'Choose realistic mark values for each question from the subject, board, exam type, and topic.',
        'If online resources are unavailable, use conservative exam-board-style marks from your knowledge and leave sourceTitle/sourceUrl empty.',
      ].join('\n');

  const system = [
    'You generate mixed exam-board practice questions as strict JSON.',
    'Do not generate flashcards or deck metadata.',
    resourceInstruction,
    formatInstruction,
    calculationInstruction,
    'For MCQs, set questionType to "mcq", provide exactly four options in A-D order without option letters inside the text, set correctOption to A/B/C/D, and make modelAnswer explain the correct option.',
    'For written questions, set questionType to "open", use options as an empty array, and correctOption as an empty string.',
    'Respect the command word, mark value, and response style expected for the subject, board, and exam type.',
    'Longer answers should require the depth expected for the chosen mark value, such as application, linked reasoning, evaluation, or judgement where the subject and exam board expect them.',
    'Each markScheme must be clear enough for another AI pass to mark a student response fairly.',
    'Always include figureUrl in each question. Use an empty string when no figure is needed.',
    'Use clean GitHub-flavored Markdown inside string values where it improves readability. Do not use raw HTML.',
    'When writing math, use explicit LaTeX with grouping and brackets.',
    'Every math expression must be wrapped for rendering: use \\\\(...\\\\) for inline math and \\\\[...\\\\] for display math. Do not leave bare LaTeX in prose.',
    'Because the response is JSON, escape every LaTeX backslash as a double backslash.',
    'Always bracket powers/subscripts inside math delimiters: x^{2}, a_{n+1}, (ab)^{2}, x_{(i+1)}.',
    `Board: ${payload.examBoard}. Type: ${payload.examType}. Subject: ${payload.subject}.`,
    payload.specification ? `Specification focus: ${payload.specification}` : '',
    figureUrls.length > 0 ? 'Use provided figure URLs when a question references a figure.' : 'Do not invent figure URLs.',
    `Generate exactly ${payload.questionCount} questions.`,
    'Return JSON only and match the provided schema.',
  ]
    .filter(Boolean)
    .join('\n');

  const user = [
    `Topic: ${payload.topic}`,
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
    temperature: 0.25,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      { role: 'user', content: [{ type: 'input_text', text: user }] },
    ],
    text: { format: { type: 'json_schema', name: 'mixed_exam_questions', schema: SCHEMA, strict: true } },
  };

  if (useWebSearch) {
    body.tools = [
      {
        type: 'web_search',
        user_location: { type: 'approximate', country: 'GB', timezone: 'Europe/London' },
      },
    ];
    body.tool_choice = 'auto';
    body.include = ['web_search_call.action.sources'];
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
  if (!parsed) throw new Error('AI response was not valid question JSON.');
  return { parsed, errorText: '' };
};

const requestChatFallback = async (
  config: ReturnType<typeof getAIConfig>,
  system: string,
  user: string,
  responsesErrorText: string
) => {
  const commonHeaders = buildAIHeaders(config);
  const chatResponse = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      model: config.model,
      temperature: 0.25,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'mixed_exam_questions',
          schema: SCHEMA,
          strict: true,
        },
      },
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
  if (!parsed) throw new Error('AI chat/completions response was not valid question JSON.');
  return parsed;
};

const aiGenerate = async (
  payload: ReturnType<typeof normalizePayload>,
  figureUrls: string[]
): Promise<AIQuestionResult> => {
  const config = getAIConfig();
  const canUseWebSearch = payload.useOnlineResources && config.isOpenAIHosted && config.baseUrl === OPENAI_DEFAULT_BASE_URL;
  const { system, user } = buildPrompt(payload, figureUrls, canUseWebSearch);

  if (canUseWebSearch) {
    const webResponse = await requestResponses(config, system, user, true);
    if (webResponse.parsed) {
      return { generated: webResponse.parsed, usedOnlineResources: true, onlineLookupFailed: false };
    }

    const fallbackPrompt = buildPrompt(payload, figureUrls, false);
    const fallbackResponse = await requestResponses(config, fallbackPrompt.system, fallbackPrompt.user, false);
    if (fallbackResponse.parsed) {
      return { generated: fallbackResponse.parsed, usedOnlineResources: false, onlineLookupFailed: true };
    }

    const chatGenerated = await requestChatFallback(config, fallbackPrompt.system, fallbackPrompt.user, fallbackResponse.errorText || webResponse.errorText);
    return { generated: chatGenerated, usedOnlineResources: false, onlineLookupFailed: true };
  }

  const response = await requestResponses(config, system, user, false);
  if (response.parsed) {
    return { generated: response.parsed, usedOnlineResources: false, onlineLookupFailed: payload.useOnlineResources };
  }

  const chatGenerated = await requestChatFallback(config, system, user, response.errorText);
  return { generated: chatGenerated, usedOnlineResources: false, onlineLookupFailed: payload.useOnlineResources };
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

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawBody = (await request.json()) as GenerateQuestionsPayload;
    const payload = normalizePayload(rawBody);

    if (!payload.topic) return NextResponse.json({ error: 'Topic is required.' }, { status: 400 });
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

    const config = getAIConfig();
    const missingKeyError = getMissingHostedKeyError(config);
    if (missingKeyError) {
      return NextResponse.json({ error: missingKeyError }, { status: 500 });
    }

    const figureUrls = dedupe([payload.figureUrl, ...extractFigureUrls(payload.prompt)].filter(Boolean)).slice(0, 8);
    const warnings: string[] = [];

    const aiResult = await aiGenerate(payload, figureUrls);
    if (aiResult.onlineLookupFailed) {
      warnings.push('Online resource lookup was unavailable, so marks were chosen without live source lookup.');
    }

    const normalizedQuestions = (Array.isArray(aiResult.generated.questions) ? aiResult.generated.questions : [])
      .map((question) => normalizeQuestion(question, payload))
      .filter((question): question is ExamQuestion => question !== null);

    const uniqueQuestions: ExamQuestion[] = [];
    const seen = new Set<string>();
    for (const question of normalizedQuestions) {
      if (uniqueQuestions.length >= payload.questionCount) break;
      const key = `${question.marks}:${question.question.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueQuestions.push(question);
    }

    if (uniqueQuestions.length === 0) {
      return NextResponse.json({ error: 'AI did not return valid exam-practice questions.' }, { status: 502 });
    }
    if (uniqueQuestions.length < payload.questionCount) {
      warnings.push(`Generated ${uniqueQuestions.length} unique questions out of requested ${payload.questionCount}.`);
    }

    const missingFigureReference = uniqueQuestions.some((question) => referencesFigure(question.question) && !question.figureUrl);
    const withFigures = applyFigureReferences(uniqueQuestions, figureUrls).questions;
    if (missingFigureReference && figureUrls.length === 0) {
      warnings.push('Some questions reference a figure, but no figure URL was provided.');
    }

    return NextResponse.json({
      success: true,
      questionCount: withFigures.length,
      questions: withFigures,
      sources: getSources(withFigures),
      usedOnlineResources: aiResult.usedOnlineResources,
      warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate questions.';
    return NextResponse.json({ error: txt(message, MAX_AI_ERROR_TEXT) }, { status: 500 });
  }
}
