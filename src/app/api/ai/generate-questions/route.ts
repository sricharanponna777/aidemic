import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

type SupportedBoard = 'aqa' | 'edexcel' | 'ocr';
type SupportedExamType = 'gcse' | 'a-level';
type CorrectOption = 'A' | 'B' | 'C' | 'D';

const SUPPORTED_BOARDS: SupportedBoard[] = ['aqa', 'edexcel', 'ocr'];
const SUPPORTED_EXAM_TYPES: SupportedExamType[] = ['gcse', 'a-level'];
const SUPPORTED_SUBJECTS = [
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
type SupportedSubject = (typeof SUPPORTED_SUBJECTS)[number];

interface GenerateQuestionsPayload {
  topic?: string;
  subject?: string;
  prompt?: string;
  examBoard?: string;
  examType?: string;
  specification?: string;
  figureUrl?: string;
  questionCount?: number;
}

type QuizQuestion = {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: CorrectOption;
  explanation: string;
  figureUrl?: string;
};

type GeneratedQuiz = {
  questions: QuizQuestion[];
};

type OpenAIResponseBody = {
  output_text?: string;
  output?: Array<{ content?: Array<{ json?: unknown; text?: string; type?: string }> }>;
};

type ChatCompletionsResponseBody = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      parsed?: unknown;
    };
  }>;
};

const MIN_QUESTIONS = 4;
const MAX_QUESTIONS = 40;
const MAX_TEXT = 2400;
const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

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
        required: ['question', 'optionA', 'optionB', 'optionC', 'optionD', 'correctOption', 'explanation', 'figureUrl'],
        properties: {
          question: { type: 'string' },
          optionA: { type: 'string' },
          optionB: { type: 'string' },
          optionC: { type: 'string' },
          optionD: { type: 'string' },
          correctOption: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
          explanation: { type: 'string' },
          figureUrl: { type: 'string' },
        },
      },
    },
  },
};

const txt = (s: string, len: number) => s.replace(/\r\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim().slice(0, len);

const safe = (s: string) =>
  s
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<[^>]*>/g, '');

const dedupe = (items: string[]) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

const clampQuestions = (n?: number) => {
  const value = Number(n);
  if (!Number.isFinite(value)) return 12;
  return Math.min(Math.max(Math.floor(value), MIN_QUESTIONS), MAX_QUESTIONS);
};

const normalizeBoard = (value?: string): SupportedBoard | null => {
  const cleaned = txt((value || '').toLowerCase(), 24).replace(/\s+/g, '');
  if (cleaned === 'aqa') return 'aqa';
  if (cleaned === 'edexcel') return 'edexcel';
  if (cleaned === 'ocr') return 'ocr';
  return null;
};

const normalizeExamType = (value?: string): SupportedExamType | null => {
  const cleaned = txt((value || '').toLowerCase(), 24).replace(/\s+/g, '');
  if (cleaned === 'gcse') return 'gcse';
  if (cleaned === 'a-level' || cleaned === 'alevel') return 'a-level';
  return null;
};

const sanitizeFigureUrl = (raw: string) => {
  const candidate = txt(raw, 900);
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
    return '';
  } catch {
    return '';
  }
};

const extractFigureUrls = (text: string) => {
  const urls: string[] = [];
  const markdownMatches = text.matchAll(/!\[[^\]]*]\((https?:\/\/[^\s)]+)\)/gi);
  for (const match of markdownMatches) {
    const url = sanitizeFigureUrl(match[1] || '');
    if (url) urls.push(url);
  }

  const htmlMatches = text.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi);
  for (const match of htmlMatches) {
    const url = sanitizeFigureUrl(match[1] || '');
    if (url) urls.push(url);
  }

  const bareMatches = text.matchAll(/\bhttps?:\/\/[^\s<>"')]+/gi);
  for (const match of bareMatches) {
    const candidate = match[0] || '';
    if (!/\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i.test(candidate)) continue;
    const url = sanitizeFigureUrl(candidate);
    if (url) urls.push(url);
  }

  return dedupe(urls).slice(0, 8);
};

const coerceGeneratedQuiz = (value: unknown): GeneratedQuiz | null => {
  if (!value || typeof value !== 'object') return null;
  const direct = value as { questions?: unknown };
  if (Array.isArray(direct.questions)) {
    return { questions: direct.questions as QuizQuestion[] };
  }
  const nestedCandidates = Object.values(value as Record<string, unknown>);
  for (const candidate of nestedCandidates) {
    if (candidate && typeof candidate === 'object') {
      const nested = candidate as { questions?: unknown };
      if (Array.isArray(nested.questions)) {
        return { questions: nested.questions as QuizQuestion[] };
      }
    }
  }
  return null;
};

const extractFirstJsonObject = (text: string) => {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return '';
};

const extractJson = (rawText: string): GeneratedQuiz | null => {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return coerceGeneratedQuiz(parsed);
  } catch {
    const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i) || trimmed.match(/```\s*([\s\S]*?)\s*```/i);
    if (fenceMatch?.[1]) {
      try {
        const parsed = JSON.parse(fenceMatch[1]) as unknown;
        const coerced = coerceGeneratedQuiz(parsed);
        if (coerced) return coerced;
      } catch {
        // continue
      }
    }

    const candidate = extractFirstJsonObject(trimmed);
    if (!candidate) return null;
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return coerceGeneratedQuiz(parsed);
    } catch {
      return null;
    }
  }
};

const tryExtractFromUnknown = (value: unknown): GeneratedQuiz | null => {
  const coerced = coerceGeneratedQuiz(value);
  if (coerced) return coerced;
  if (typeof value === 'string') return extractJson(value);
  return null;
};

const extractQuizFromResponsesBody = (body: OpenAIResponseBody): GeneratedQuiz | null => {
  const direct = extractJson(typeof body.output_text === 'string' ? body.output_text : '');
  if (direct) return direct;

  if (!Array.isArray(body.output)) return null;
  for (const item of body.output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const entry of content) {
      const fromJson = tryExtractFromUnknown(entry.json);
      if (fromJson) return fromJson;
      const fromText = extractJson(entry.text || '');
      if (fromText) return fromText;
    }
  }
  return null;
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
});

const normalizeBaseUrl = (value?: string) => {
  const raw = txt(value || '', 400);
  if (!raw) return OPENAI_DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, '');
};

const getAIConfig = () => {
  const baseUrl = normalizeBaseUrl(process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || OPENAI_DEFAULT_BASE_URL);
  const apiKey = txt(process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '', 300);
  const model = txt(process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini', 120);
  const isOpenAIHosted = /api\.openai\.com/i.test(baseUrl);
  const isOpenRouter = /openrouter\.ai/i.test(baseUrl);
  const openRouterSiteUrl = txt(process.env.OPENROUTER_SITE_URL || '', 200);
  const openRouterAppName = txt(process.env.OPENROUTER_APP_NAME || '', 100);
  return { baseUrl, apiKey, model, isOpenAIHosted, isOpenRouter, openRouterSiteUrl, openRouterAppName };
};

const normalizeQuestion = (question: QuizQuestion): QuizQuestion | null => {
  const normalized: QuizQuestion = {
    question: txt(safe((question.question || '').replace(/^question\s*[:\-]\s*/i, '')), 520),
    optionA: txt(safe(question.optionA || ''), 220),
    optionB: txt(safe(question.optionB || ''), 220),
    optionC: txt(safe(question.optionC || ''), 220),
    optionD: txt(safe(question.optionD || ''), 220),
    correctOption: txt((question.correctOption || '').toUpperCase(), 1) as CorrectOption,
    explanation: txt(safe(question.explanation || ''), 520),
    figureUrl: sanitizeFigureUrl(question.figureUrl || ''),
  };

  if (!normalized.question || !normalized.optionA || !normalized.optionB || !normalized.optionC || !normalized.optionD || !normalized.explanation) {
    return null;
  }
  if (!['A', 'B', 'C', 'D'].includes(normalized.correctOption)) return null;
  const optionSet = new Set([normalized.optionA.toLowerCase(), normalized.optionB.toLowerCase(), normalized.optionC.toLowerCase(), normalized.optionD.toLowerCase()]);
  if (optionSet.size < 4) return null;
  return normalized;
};

const referencesFigure = (text: string) => /\bfigure\b/i.test(text);

const applyFigureReferences = (questions: QuizQuestion[], figureUrls: string[]) => {
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

const aiGenerate = async (
  payload: ReturnType<typeof normalizePayload>,
  figureUrls: string[]
): Promise<GeneratedQuiz> => {
  const config = getAIConfig();

  const system = [
    'You generate exam-board multiple-choice questions as strict JSON.',
    'Do not generate flashcards and do not include deck metadata.',
    'For each question return exactly four options: A, B, C, D.',
    'Exactly one option must be correct.',
    'Always include figureUrl in each question. Use an empty string when no figure is needed.',
    'Distractors must be plausible for exam revision.',
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
    `Prompt requirements: ${payload.prompt}`,
    figureUrls.length > 0 ? `Figure URLs:\n${figureUrls.map((url, i) => `${i + 1}. ${url}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const commonHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    commonHeaders.Authorization = `Bearer ${config.apiKey}`;
  }
  if (config.isOpenRouter) {
    if (config.openRouterSiteUrl) {
      commonHeaders['HTTP-Referer'] = config.openRouterSiteUrl;
    }
    if (config.openRouterAppName) {
      commonHeaders['X-Title'] = config.openRouterAppName;
    }
  }

  const responsesResponse = await fetch(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      model: config.model,
      temperature: 0.3,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: system }] },
        { role: 'user', content: [{ type: 'input_text', text: user }] },
      ],
      text: { format: { type: 'json_schema', name: 'mcq_questions', schema: SCHEMA, strict: true } },
    }),
  });

  if (responsesResponse.ok) {
    const body = (await responsesResponse.json()) as OpenAIResponseBody;
    const parsed = extractQuizFromResponsesBody(body);
    if (!parsed) throw new Error('AI response was not valid question JSON.');
    return parsed;
  }

  const responsesErrorText = await responsesResponse.text();

  const chatResponse = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      model: config.model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'mcq_questions',
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

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawBody = (await request.json()) as GenerateQuestionsPayload;
    const payload = normalizePayload(rawBody);

    if (!payload.topic) return NextResponse.json({ error: 'Topic is required.' }, { status: 400 });
    if (!payload.prompt || payload.prompt.length < 12) {
      return NextResponse.json({ error: 'Prompt details are required.' }, { status: 400 });
    }
    if (!payload.examBoard || !SUPPORTED_BOARDS.includes(payload.examBoard)) {
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
    if (config.isOpenAIHosted && !config.apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY (or AI_API_KEY) is required for OpenAI hosted API.' }, { status: 500 });
    }

    const figureUrls = dedupe([payload.figureUrl, ...extractFigureUrls(payload.prompt)].filter(Boolean)).slice(0, 8);
    const warnings: string[] = [];

    const aiRaw = await aiGenerate(payload, figureUrls);
    const normalizedQuestions = (Array.isArray(aiRaw.questions) ? aiRaw.questions : [])
      .map((question) => normalizeQuestion(question))
      .filter((question): question is QuizQuestion => question !== null);

    if (normalizedQuestions.length === 0) {
      return NextResponse.json({ error: 'AI did not return valid MCQs.' }, { status: 502 });
    }

    const uniqueQuestions: QuizQuestion[] = [];
    const seen = new Set<string>();
    for (const question of normalizedQuestions) {
      if (uniqueQuestions.length >= payload.questionCount) break;
      const key = question.question.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueQuestions.push(question);
    }

    if (uniqueQuestions.length === 0) {
      return NextResponse.json({ error: 'No usable MCQs were generated.' }, { status: 502 });
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
      warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate questions.';
    return NextResponse.json({ error: txt(message, MAX_TEXT) }, { status: 500 });
  }
}
