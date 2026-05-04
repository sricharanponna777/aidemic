import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { buildAIHeaders, getAIConfig, getMissingHostedKeyError } from '@/lib/ai/config';
import { extractFromResponsesBody, extractJsonWithCoercer, tryExtractWithCoercer, type OpenAIResponseBody, type ChatCompletionsResponseBody } from '@/lib/ai/json';
import { normalizeMathNotation } from '@/lib/ai/math';
import { dedupe, extractFigureUrls, MAX_AI_ERROR_TEXT, safe, sanitizeFigureUrl, txt } from '@/lib/ai/text';
import {
  clampCount,
  normalizeBoard,
  normalizeExamType,
  SUPPORTED_EXAM_BOARDS,
  SUPPORTED_EXAM_TYPES,
  SUPPORTED_SUBJECTS,
  type SupportedSubject,
} from '@/lib/ai/validation';

type CorrectOption = 'A' | 'B' | 'C' | 'D';

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

const MIN_QUESTIONS = 4;
const MAX_QUESTIONS = 40;

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

const clampQuestions = (n?: number) => {
  return clampCount(n, MIN_QUESTIONS, MAX_QUESTIONS, 12);
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

const extractJson = (rawText: string): GeneratedQuiz | null => extractJsonWithCoercer(rawText, coerceGeneratedQuiz);

const tryExtractFromUnknown = (value: unknown): GeneratedQuiz | null => {
  return tryExtractWithCoercer(value, coerceGeneratedQuiz, extractJson);
};

const extractQuizFromResponsesBody = (body: OpenAIResponseBody): GeneratedQuiz | null => {
  return extractFromResponsesBody(body, coerceGeneratedQuiz, extractJson);
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

const normalizeQuestion = (question: QuizQuestion, subject: string): QuizQuestion | null => {
  const questionText = normalizeMathNotation(safe((question.question || '').replace(/^question\s*[:\-]\s*/i, '')), subject);
  const optionA = normalizeMathNotation(safe(question.optionA || ''), subject);
  const optionB = normalizeMathNotation(safe(question.optionB || ''), subject);
  const optionC = normalizeMathNotation(safe(question.optionC || ''), subject);
  const optionD = normalizeMathNotation(safe(question.optionD || ''), subject);
  const explanation = normalizeMathNotation(safe(question.explanation || ''), subject);

  const normalized: QuizQuestion = {
    question: txt(questionText, 520),
    optionA: txt(optionA, 220),
    optionB: txt(optionB, 220),
    optionC: txt(optionC, 220),
    optionD: txt(optionD, 220),
    correctOption: txt((question.correctOption || '').toUpperCase(), 1) as CorrectOption,
    explanation: txt(explanation, 520),
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
    'Use clean GitHub-flavored Markdown inside string values where it improves readability, especially **bold** key terms in explanations. Do not use raw HTML.',
    'When writing math, use explicit LaTeX with grouping and brackets.',
    'Every math expression must be wrapped for rendering: use \\\\(...\\\\) for inline math and \\\\[...\\\\] for display math. Do not leave bare LaTeX in prose.',
    'Because the response is JSON, escape every LaTeX backslash as a double backslash, for example \\\\(\\\\binom{7}{4}a^{3}b^{4}\\\\), \\\\(\\\\frac{1}{2}\\\\), \\\\(\\\\text{det}(A)\\\\), \\\\[A=\\\\begin{pmatrix}a & b \\\\\\\\ c & d\\\\end{pmatrix}\\\\].',
    'Always bracket powers/subscripts inside math delimiters: x^{2}, a_{n+1}, (ab)^{2}, x_{(i+1)}.',
    'Use grouped fractions: \\frac{numerator}{denominator}, e.g. \\frac{(x^{4}y^{2})}{(xy^{3})}.',
    'Never use ambiguous shorthand such as x2, xy3, x^n+1, or (x4y^2)/(xy3).',
    'Before finalizing each question, verify that correctOption is truly correct and explanation matches that option.',
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

  const commonHeaders = buildAIHeaders(config);

  const responsesResponse = await fetch(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
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
      temperature: 0.2,
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

const aiAuditQuestions = async (
  payload: ReturnType<typeof normalizePayload>,
  questions: QuizQuestion[]
): Promise<GeneratedQuiz> => {
  const config = getAIConfig();
  const system = [
    'You audit exam-board multiple-choice questions for correctness.',
    'Return strict JSON only using the provided schema.',
    'For each question, identify the single best answer among A, B, C, D.',
    'If correctOption is wrong, fix it.',
    'Rewrite explanation so it supports the final correct option and why it is correct.',
    'Keep question wording, options, and figureUrl unchanged unless there is a major factual or structural flaw.',
    'Preserve the same number and order of questions.',
    `Board: ${payload.examBoard}. Type: ${payload.examType}. Subject: ${payload.subject}.`,
    payload.specification ? `Specification focus: ${payload.specification}` : '',
    'Do not add or remove questions.',
  ]
    .filter(Boolean)
    .join('\n');

  const user = [
    `Topic: ${payload.topic}`,
    'Audit this generated question JSON and correct wrong answer keys/explanations:',
    JSON.stringify({ questions }, null, 2),
  ].join('\n\n');

  const commonHeaders = buildAIHeaders(config);

  const responsesResponse = await fetch(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: system }] },
        { role: 'user', content: [{ type: 'input_text', text: user }] },
      ],
      text: { format: { type: 'json_schema', name: 'mcq_questions_audit', schema: SCHEMA, strict: true } },
    }),
  });

  if (responsesResponse.ok) {
    const body = (await responsesResponse.json()) as OpenAIResponseBody;
    const parsed = extractQuizFromResponsesBody(body);
    if (!parsed) throw new Error('AI audit response was not valid question JSON.');
    return parsed;
  }

  const responsesErrorText = await responsesResponse.text();
  const chatResponse = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'mcq_questions_audit',
          schema: SCHEMA,
          strict: true,
        },
      },
    }),
  });

  if (!chatResponse.ok) {
    const chatErrorText = await chatResponse.text();
    throw new Error(`AI audit failed. /responses: ${responsesErrorText} | /chat/completions: ${chatErrorText}`);
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
  if (!parsed) throw new Error('AI audit chat/completions response was not valid question JSON.');
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

    const aiRaw = await aiGenerate(payload, figureUrls);
    const normalizedQuestions = (Array.isArray(aiRaw.questions) ? aiRaw.questions : [])
      .map((question) => normalizeQuestion(question, payload.subject))
      .filter((question): question is QuizQuestion => question !== null);

    if (normalizedQuestions.length === 0) {
      return NextResponse.json({ error: 'AI did not return valid MCQs.' }, { status: 502 });
    }

    let reviewedQuestions = normalizedQuestions;
    try {
      const auditedRaw = await aiAuditQuestions(payload, normalizedQuestions);
      const auditedQuestions = (Array.isArray(auditedRaw.questions) ? auditedRaw.questions : [])
        .map((question) => normalizeQuestion(question, payload.subject))
        .filter((question): question is QuizQuestion => question !== null);

      if (auditedQuestions.length === normalizedQuestions.length) {
        reviewedQuestions = normalizedQuestions.map((question, index) => ({
          ...question,
          correctOption: auditedQuestions[index].correctOption,
          explanation: auditedQuestions[index].explanation,
        }));
      } else {
        warnings.push('Answer audit returned incomplete results. Using original generated answers.');
      }
    } catch {
      warnings.push('Answer audit could not be completed. Using original generated answers.');
    }

    const uniqueQuestions: QuizQuestion[] = [];
    const seen = new Set<string>();
    for (const question of reviewedQuestions) {
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
    return NextResponse.json({ error: txt(message, MAX_AI_ERROR_TEXT) }, { status: 500 });
  }
}
