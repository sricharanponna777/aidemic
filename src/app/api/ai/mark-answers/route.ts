import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { buildAIHeaders, getAIConfig, getMissingHostedKeyError } from '@/lib/ai/config';
import {
  extractChatMessageText,
  extractFromResponsesBody,
  extractJsonWithCoercer,
  tryExtractWithCoercer,
  type ChatCompletionsResponseBody,
  type OpenAIResponseBody,
} from '@/lib/ai/json';
import { normalizeMathNotation } from '@/lib/ai/math';
import { MAX_AI_ERROR_TEXT, safe, sanitizeFigureUrl, txt } from '@/lib/ai/text';
import {
  normalizeBoard,
  normalizeExamType,
  SUPPORTED_EXAM_BOARDS,
  SUPPORTED_EXAM_TYPES,
  SUPPORTED_SUBJECTS,
  type SupportedSubject,
} from '@/lib/ai/validation';

type MarkingQuestion = {
  questionType: 'open' | 'mcq';
  question: string;
  marks: number;
  commandWord: string;
  isCalculation: boolean;
  options: string[];
  correctOption: '' | 'A' | 'B' | 'C' | 'D';
  markScheme: string[];
  modelAnswer: string;
  skillsAssessed: string[];
  figureUrl?: string;
  sourceTitle: string;
  sourceUrl: string;
};

type MarkedAnswer = {
  questionIndex: number;
  marksAwarded: number;
  maxMarks: number;
  band: string;
  feedback: string;
  strengths: string[];
  improvements: string[];
  weaknessTags: string[];
  exemplarAnswer: string;
};

type AIMarkingReport = {
  markedAnswers: MarkedAnswer[];
  summary: string;
  weaknessAnalysis: string[];
  gradeBoostAdvice: string[];
};

interface MarkAnswersPayload {
  topic?: string;
  subject?: string;
  examBoard?: string;
  examType?: string;
  specification?: string;
  sourceMaterial?: string;
  questions?: unknown;
  answers?: unknown;
}

const MAX_QUESTIONS = 20;
const MAX_MARK_VALUE = 40;
const MARKING_MAX_OUTPUT_TOKENS = 2000;
const MAX_AI_RESPONSE_LOG_TEXT = 12000;

const truncateForLog = (value: string) =>
  value.length > MAX_AI_RESPONSE_LOG_TEXT
    ? `${value.slice(0, MAX_AI_RESPONSE_LOG_TEXT)}... [truncated ${value.length - MAX_AI_RESPONSE_LOG_TEXT} chars]`
    : value;

const logInvalidMarkingJson = (source: string, payload: unknown) => {
  try {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    console.error(`[mark-answers] AI response was not valid marking JSON (${source})`, truncateForLog(serialized || ''));
  } catch (err) {
    console.error(`[mark-answers] AI response was not valid marking JSON (${source})`, payload, err);
  }
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['markedAnswers', 'summary', 'weaknessAnalysis', 'gradeBoostAdvice'],
  properties: {
    markedAnswers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'questionIndex',
          'marksAwarded',
          'maxMarks',
          'band',
          'feedback',
          'strengths',
          'improvements',
          'weaknessTags',
          'exemplarAnswer',
        ],
        properties: {
          questionIndex: { type: 'number' },
          marksAwarded: { type: 'number' },
          maxMarks: { type: 'number' },
          band: { type: 'string' },
          feedback: { type: 'string' },
          strengths: {
            type: 'array',
            items: { type: 'string' },
          },
          improvements: {
            type: 'array',
            items: { type: 'string' },
          },
          weaknessTags: {
            type: 'array',
            items: { type: 'string' },
          },
          exemplarAnswer: { type: 'string' },
        },
      },
    },
    summary: { type: 'string' },
    weaknessAnalysis: {
      type: 'array',
      items: { type: 'string' },
    },
    gradeBoostAdvice: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};

const coerceMarkingReport = (value: unknown): AIMarkingReport | null => {
  if (!value || typeof value !== 'object') return null;
  const direct = value as { markedAnswers?: unknown; summary?: unknown; weaknessAnalysis?: unknown; gradeBoostAdvice?: unknown };
  if (Array.isArray(direct.markedAnswers)) {
    return {
      markedAnswers: direct.markedAnswers as MarkedAnswer[],
      summary: typeof direct.summary === 'string' ? direct.summary : '',
      weaknessAnalysis: Array.isArray(direct.weaknessAnalysis) ? (direct.weaknessAnalysis as string[]) : [],
      gradeBoostAdvice: Array.isArray(direct.gradeBoostAdvice) ? (direct.gradeBoostAdvice as string[]) : [],
    };
  }

  const nestedCandidates = Object.values(value as Record<string, unknown>);
  for (const candidate of nestedCandidates) {
    const nested = coerceMarkingReport(candidate);
    if (nested) return nested;
  }
  return null;
};

const extractJson = (rawText: string): AIMarkingReport | null => extractJsonWithCoercer(rawText, coerceMarkingReport);

const extractReportFromResponsesBody = (body: OpenAIResponseBody): AIMarkingReport | null => {
  return extractFromResponsesBody(body, coerceMarkingReport, extractJson);
};

const parseMarks = (value: unknown) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  const integerValue = Math.floor(numberValue);
  if (integerValue < 1 || integerValue > MAX_MARK_VALUE) return null;
  return integerValue;
};

const clampAwardedMarks = (value: unknown, maxMarks: number) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.min(Math.max(Math.round(numberValue), 0), maxMarks);
};

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

const normalizeQuestion = (value: unknown, subject: string): MarkingQuestion | null => {
  if (!value || typeof value !== 'object') return null;
  const question = value as Partial<MarkingQuestion>;
  const marks = parseMarks(question.marks);
  if (marks === null) return null;
  const questionType = question.questionType === 'mcq' ? 'mcq' : 'open';
  const options = questionType === 'mcq' ? normalizeOptions(question.options, subject) : [];
  const correctOption = txt((question.correctOption || '').toUpperCase(), 1) as MarkingQuestion['correctOption'];

  const normalized: MarkingQuestion = {
    questionType,
    question: txt(normalizeMathNotation(safe(question.question || ''), subject), 900),
    marks,
    commandWord: txt(safe(question.commandWord || ''), 80),
    isCalculation: Boolean(question.isCalculation),
    options,
    correctOption: questionType === 'mcq' ? correctOption : '',
    markScheme: normalizeStringList(question.markScheme, subject, 10, 320),
    modelAnswer: txt(normalizeMathNotation(safe(question.modelAnswer || ''), subject), 1400),
    skillsAssessed: normalizeStringList(question.skillsAssessed, subject, 6, 80),
    figureUrl: sanitizeFigureUrl(question.figureUrl || ''),
    sourceTitle: txt(safe(question.sourceTitle || ''), 160),
    sourceUrl: sanitizeFigureUrl(question.sourceUrl || ''),
  };

  if (!normalized.question || normalized.markScheme.length === 0 || !normalized.modelAnswer) return null;
  if (normalized.questionType === 'mcq') {
    const validCorrectOptions = ['A', 'B', 'C', 'D'].slice(0, normalized.options.length);
    if (normalized.options.length < 3 || normalized.options.length > 4 || !validCorrectOptions.includes(normalized.correctOption)) return null;
  }
  return normalized;
};

const normalizePayload = (raw: MarkAnswersPayload) => {
  const subject = txt((raw.subject || '').toLowerCase(), 60);
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .slice(0, MAX_QUESTIONS)
    .map((question) => normalizeQuestion(question, subject))
    .filter((question): question is MarkingQuestion => question !== null);

  const rawAnswers = Array.isArray(raw.answers) ? raw.answers : [];
  const answers = questions.map((_, index) => txt(safe(String(rawAnswers[index] || '')), 5000));

  return {
    topic: txt(raw.topic || '', 200),
    subject,
    examBoard: normalizeBoard(raw.examBoard),
    examType: normalizeExamType(raw.examType),
    specification: txt(raw.specification || '', 280),
    sourceMaterial: txt(raw.sourceMaterial || '', 12000),
    questions,
    answers,
  };
};

type GcseTier = 'foundation' | 'higher' | null;

const getGcseTier = (specification: string): GcseTier => {
  const normalized = specification.toLowerCase();
  if (/\bfoundation\b/.test(normalized)) return 'foundation';
  if (/\bhigher\b/.test(normalized)) return 'higher';
  return null;
};

const estimateGrade = (
  percentage: number,
  examType: 'gcse' | 'a-level',
  board: 'aqa' | 'edexcel' | 'ocr' | null,
  gcseTier: GcseTier
) => {
  const adjustment = board === 'edexcel' ? -2 : board === 'ocr' ? -1 : 0;
  const boundaries =
    examType === 'a-level'
      ? [
          ['A*', 85],
          ['A', 75],
          ['B', 65],
          ['C', 55],
          ['D', 45],
          ['E', 35],
        ]
      : gcseTier === 'foundation'
      ? [
          ['5', 70],
          ['4', 55],
          ['3', 40],
          ['2', 25],
          ['1', 10],
        ]
      : gcseTier === 'higher'
      ? [
          ['9', 85],
          ['8', 78],
          ['7', 70],
          ['6', 60],
          ['5', 50],
          ['4', 40],
          ['3', 30],
        ]
      : [
          ['9', 85],
          ['8', 78],
          ['7', 70],
          ['6', 60],
          ['5', 50],
          ['4', 40],
          ['3', 30],
          ['2', 20],
          ['1', 10],
        ];

  for (const [grade, boundary] of boundaries) {
    if (percentage >= Number(boundary) + adjustment) return String(grade);
  }
  return 'U';
};

const getNextGrade = (grade: string, examType: 'gcse' | 'a-level', gcseTier: GcseTier) => {
  const order =
    examType === 'a-level'
      ? ['U', 'E', 'D', 'C', 'B', 'A', 'A*']
      : gcseTier === 'foundation'
      ? ['U', '1', '2', '3', '4', '5']
      : gcseTier === 'higher'
      ? ['U', '3', '4', '5', '6', '7', '8', '9']
      : ['U', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const index = order.indexOf(grade);
  if (index < 0 || index >= order.length - 1) return null;
  return order[index + 1];
};

const getTopGrade = (examType: 'gcse' | 'a-level', gcseTier: GcseTier) => {
  if (examType === 'a-level') return 'A*';
  if (gcseTier === 'foundation') return '5';
  return '9';
};

const getGradeBoundaryNote = (examType: 'gcse' | 'a-level', gcseTier: GcseTier) => {
  if (examType === 'a-level') {
    return 'Predicted from this practice set using approximate A-Level boundaries. Real grade boundaries vary by paper and exam series.';
  }
  if (gcseTier === 'foundation') {
    return 'Predicted from this practice set using approximate GCSE Foundation tier boundaries. Foundation tier is capped at grade 5.';
  }
  if (gcseTier === 'higher') {
    return 'Predicted from this practice set using approximate GCSE Higher tier boundaries. Higher tier awards grades 9-3; below grade 3 is U.';
  }
  return 'Predicted from this practice set using approximate GCSE 9-1 boundaries. Real grade boundaries vary by paper and exam series.';
};

const getBand = (marksAwarded: number, maxMarks: number) => {
  if (marksAwarded <= 0) return 'No credit yet';
  const ratio = marksAwarded / Math.max(maxMarks, 1);
  if (ratio >= 0.85) return 'Top band';
  if (ratio >= 0.65) return 'Secure';
  if (ratio >= 0.4) return 'Developing';
  return 'Limited';
};

const normalizeMarkedAnswers = (aiReport: AIMarkingReport | null, questions: MarkingQuestion[], answers: string[]) => {
  const aiAnswers = Array.isArray(aiReport?.markedAnswers) ? aiReport.markedAnswers : [];

  return questions.map((question, index) => {
    if (question.questionType === 'mcq') {
      const selectedOption = answers[index]?.trim().toUpperCase();
      const isCorrect = selectedOption === question.correctOption;
      const correctOptionIndex = ['A', 'B', 'C', 'D'].indexOf(question.correctOption);
      const correctOptionText = correctOptionIndex >= 0 ? question.options[correctOptionIndex] : '';

      return {
        questionIndex: index,
        marksAwarded: isCorrect ? question.marks : 0,
        maxMarks: question.marks,
        band: isCorrect ? 'Correct' : selectedOption ? 'Incorrect' : 'No answer',
        feedback: isCorrect
          ? `Correct. ${question.modelAnswer}`
          : selectedOption
            ? `The correct answer was ${question.correctOption}${correctOptionText ? `: ${correctOptionText}` : ''}. ${question.modelAnswer}`
            : 'No answer was entered.',
        strengths: isCorrect ? ['Selected the correct option.'] : [],
        improvements: isCorrect ? [] : ['Review the correct option and the reasoning behind it.'],
        weaknessTags: isCorrect ? [] : ['MCQ accuracy'],
        exemplarAnswer: `Correct answer: ${question.correctOption}${correctOptionText ? ` - ${correctOptionText}` : ''}\n\n${question.modelAnswer}`,
      };
    }

    const aiAnswer = aiAnswers.find((item) => Math.floor(Number(item?.questionIndex)) === index);
    const marksAwarded = answers[index]?.trim()
      ? clampAwardedMarks(aiAnswer?.marksAwarded, question.marks)
      : 0;
    const isFullMarks = marksAwarded >= question.marks;

    return {
      questionIndex: index,
      marksAwarded,
      maxMarks: question.marks,
      band: txt(safe(isFullMarks ? 'Full marks' : aiAnswer?.band || getBand(marksAwarded, question.marks)), 80),
      feedback: txt(
        safe(
          isFullMarks
            ? aiAnswer?.feedback || 'Full marks. This answer met the mark scheme.'
            : aiAnswer?.feedback || (answers[index]?.trim() ? 'Response marked against the generated mark scheme.' : 'No answer was entered.')
        ),
        900
      ),
      strengths: normalizeStringList(aiAnswer?.strengths, '', 4, 180),
      improvements: isFullMarks ? [] : normalizeStringList(aiAnswer?.improvements, '', 4, 220),
      weaknessTags: isFullMarks ? [] : normalizeStringList(aiAnswer?.weaknessTags, '', 5, 80),
      exemplarAnswer: txt(
        normalizeMathNotation(safe(aiAnswer?.exemplarAnswer || question.modelAnswer), ''),
        1600
      ),
    };
  });
};

const buildFinalReport = (
  aiReport: AIMarkingReport | null,
  payload: ReturnType<typeof normalizePayload>
) => {
  const markedAnswers = normalizeMarkedAnswers(aiReport, payload.questions, payload.answers);
  const totalMarksAwarded = markedAnswers.reduce((sum, item) => sum + item.marksAwarded, 0);
  const totalAvailableMarks = payload.questions.reduce((sum, item) => sum + item.marks, 0);
  const percentage = totalAvailableMarks > 0 ? Math.round((totalMarksAwarded / totalAvailableMarks) * 100) : 0;
  const examType = payload.examType || 'gcse';
  const gcseTier = examType === 'gcse' ? getGcseTier(payload.specification) : null;
  const predictedGrade = estimateGrade(percentage, examType, payload.examBoard, gcseTier);
  const targetGrade = getNextGrade(predictedGrade, examType, gcseTier);
  const topGrade = getTopGrade(examType, gcseTier);
  const fullMarksAttempt = totalAvailableMarks > 0 && totalMarksAwarded >= totalAvailableMarks;

  const nonFullWeaknessTags = markedAnswers
    .filter((item) => item.marksAwarded < item.maxMarks)
    .flatMap((item) => item.weaknessTags)
    .filter(Boolean);
  const weaknessAnalysis = fullMarksAttempt
    ? []
    : nonFullWeaknessTags.length > 0
      ? [`Main pattern to fix: ${nonFullWeaknessTags[0]}.`]
      : normalizeStringList(aiReport?.weaknessAnalysis, payload.subject, 6, 260);
  if (!fullMarksAttempt && weaknessAnalysis.length === 0) {
    weaknessAnalysis.push(
      'Use more precise exam wording and make every mark visible in the answer.'
    );
  }

  const gradeBoostAdvice = normalizeStringList(aiReport?.gradeBoostAdvice, payload.subject, 6, 320);
  if (targetGrade && predictedGrade !== topGrade) {
    const targetMentioned = gradeBoostAdvice.some((item) => item.includes(targetGrade));
    if (!targetMentioned) {
      gradeBoostAdvice.unshift(
        `To move from ${predictedGrade} to ${targetGrade}, rewrite the lowest-scoring answers with clearer knowledge, direct application to the question context, and one extra linked reason or judgement.`
      );
    }
  }

  if (gradeBoostAdvice.length === 0) {
    gradeBoostAdvice.push(`Keep ${topGrade} secure by practising the highest-mark questions under timed conditions and checking every judgement against the mark scheme.`);
  }

  return {
    markedAnswers,
    totalMarksAwarded,
    totalAvailableMarks,
    percentage,
    predictedGrade,
    targetGrade,
    summary: txt(
      safe(aiReport?.summary || `You scored ${totalMarksAwarded} out of ${totalAvailableMarks} on this generated practice set.`),
      900
    ),
    weaknessAnalysis,
    gradeBoostAdvice,
    gradeBoundaryNote: getGradeBoundaryNote(examType, gcseTier),
  };
};

const aiMarkAnswers = async (payload: ReturnType<typeof normalizePayload>): Promise<AIMarkingReport> => {
  const config = getAIConfig();

  const system = [
    `Mark exam answers as strict JSON. Board:${payload.examBoard} Type:${payload.examType} Subject:${payload.subject}.`,
    payload.specification ? `Spec:${payload.specification}` : '',
    'Award integer marks 0–maxMarks per question. Blank/irrelevant=0.',
    'MCQs marked by server; include in summary/weaknessAnalysis/gradeBoostAdvice only.',
    'If a question earns full marks, leave its improvements and weaknessTags empty.',
    'Calculations: credit correct method+working+answer+units; wording not required.',
    'Open: reward knowledge, application, analysis, evaluation per mark value.',
    'One markedAnswers entry per question, same order, zero-based questionIndex.',
    'feedback: specific to student answer, where marks won/lost.',
    'weaknessAnalysis: aggregate repeated weaknesses across attempt.',
    'gradeBoostAdvice: concrete next steps to raise grade by ≥1 level.',
    'Keep all text concise: feedback≤30 words, strengths/improvements≤1 item each, exemplarAnswer≤40 words, summary≤20 words.',
    'Return JSON only. Match schema.',
  ]
    .filter(Boolean)
    .join(' ');

  const attempt = payload.questions.map((question, index) => ({
    questionIndex: index,
    questionType: question.questionType,
    question: question.question,
    maxMarks: question.marks,
    commandWord: question.commandWord,
    isCalculation: question.isCalculation,
    options: question.options,
    correctOption: question.correctOption,
    skillsAssessed: question.skillsAssessed,
    markScheme: question.markScheme,
    modelAnswer: question.modelAnswer,
    studentAnswer: payload.answers[index] || '',
  }));

  const user = [
    `Topic: ${payload.topic}`,
    payload.sourceMaterial ? `Source material:\n${payload.sourceMaterial}` : '',
    'Mark this attempt:',
    JSON.stringify({ attempt }, null, 2),
  ].filter(Boolean).join('\n\n');

  const commonHeaders = buildAIHeaders(config);

  // OpenRouter: skip /responses (unsupported) and go straight to chat
  if (!config.isOpenRouter) {
    const responsesResponse = await fetch(`${config.baseUrl}/responses`, {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_output_tokens: MARKING_MAX_OUTPUT_TOKENS,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: system }] },
          { role: 'user', content: [{ type: 'input_text', text: user }] },
        ],
        text: { format: { type: 'json_schema', name: 'exam_answer_marking', schema: SCHEMA, strict: true } },
      }),
    });

    if (responsesResponse.ok) {
      const body = (await responsesResponse.json()) as OpenAIResponseBody;
      const parsed = extractReportFromResponsesBody(body);
      if (!parsed) {
        logInvalidMarkingJson('/responses', body);
        throw new Error('AI response was not valid marking JSON.');
      }
      return parsed;
    }
  }

  const responsesErrorText = '';

  const chatResponse = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: MARKING_MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      ...(config.supportsJsonSchema
        ? { response_format: { type: 'json_schema', json_schema: { name: 'exam_answer_marking', schema: SCHEMA, strict: true } } }
        : { response_format: { type: 'json_object' } }),
    }),
  });

  if (!chatResponse.ok) {
    const chatErrorText = await chatResponse.text();
    throw new Error(`AI marking failed. /responses: ${responsesErrorText} | /chat/completions: ${chatErrorText}`);
  }

  const chatBody = (await chatResponse.json()) as ChatCompletionsResponseBody;
  const parsedField = tryExtractWithCoercer(chatBody.choices?.[0]?.message?.parsed, coerceMarkingReport, extractJson);
  if (parsedField) return parsedField;

  const chatMessage = chatBody.choices?.[0]?.message;
  const chatText = extractChatMessageText(chatBody);
  const parsed = extractJson(chatText);
  if (!parsed) {
    logInvalidMarkingJson('/chat/completions', {
      parsed: chatMessage?.parsed,
      content: chatText,
      rawMessage: chatMessage,
    });
    throw new Error('AI chat/completions response was not valid marking JSON.');
  }
  return parsed;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawBody = (await request.json()) as MarkAnswersPayload;
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
    if (payload.questions.length === 0) {
      return NextResponse.json({ error: 'No valid questions were submitted for marking.' }, { status: 400 });
    }

    const config = getAIConfig();
    const missingKeyError = getMissingHostedKeyError(config);
    if (missingKeyError) {
      return NextResponse.json({ error: missingKeyError }, { status: 500 });
    }

    const aiReport = await aiMarkAnswers(payload);
    const report = buildFinalReport(aiReport, payload);

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to mark answers.';
    return NextResponse.json({ error: txt(message, MAX_AI_ERROR_TEXT) }, { status: 500 });
  }
}

