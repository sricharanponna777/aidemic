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
  questions?: unknown;
  answers?: unknown;
}

const MAX_QUESTIONS = 20;
const MAX_MARK_VALUE = 30;

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
    if (normalized.options.length !== 4 || !['A', 'B', 'C', 'D'].includes(normalized.correctOption)) return null;
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
    questions,
    answers,
  };
};

const estimateGrade = (percentage: number, examType: 'gcse' | 'a-level', board: 'aqa' | 'edexcel' | 'ocr' | null) => {
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

const getNextGrade = (grade: string, examType: 'gcse' | 'a-level') => {
  const order = examType === 'a-level' ? ['U', 'E', 'D', 'C', 'B', 'A', 'A*'] : ['U', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const index = order.indexOf(grade);
  if (index < 0 || index >= order.length - 1) return null;
  return order[index + 1];
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

    return {
      questionIndex: index,
      marksAwarded,
      maxMarks: question.marks,
      band: txt(safe(aiAnswer?.band || getBand(marksAwarded, question.marks)), 80),
      feedback: txt(
        safe(aiAnswer?.feedback || (answers[index]?.trim() ? 'Response marked against the generated mark scheme.' : 'No answer was entered.')),
        900
      ),
      strengths: normalizeStringList(aiAnswer?.strengths, '', 4, 180),
      improvements: normalizeStringList(aiAnswer?.improvements, '', 4, 220),
      weaknessTags: normalizeStringList(aiAnswer?.weaknessTags, '', 5, 80),
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
  const predictedGrade = estimateGrade(percentage, examType, payload.examBoard);
  const targetGrade = getNextGrade(predictedGrade, examType);
  const topGrade = examType === 'a-level' ? 'A*' : '9';

  const weaknessAnalysis = normalizeStringList(aiReport?.weaknessAnalysis, payload.subject, 6, 260);
  if (weaknessAnalysis.length === 0) {
    const tags = markedAnswers.flatMap((item) => item.weaknessTags).filter(Boolean);
    weaknessAnalysis.push(
      tags[0]
        ? `Main pattern to fix: ${tags[0]}.`
        : 'Use more precise exam wording and make every mark visible in the answer.'
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
    gradeBoundaryNote:
      examType === 'a-level'
        ? 'Predicted from this practice set using approximate A-Level boundaries. Real grade boundaries vary by paper and exam series.'
        : 'Predicted from this practice set using approximate GCSE 9-1 boundaries. Real grade boundaries vary by paper and exam series.',
  };
};

const aiMarkAnswers = async (payload: ReturnType<typeof normalizePayload>): Promise<AIMarkingReport> => {
  const config = getAIConfig();

  const system = [
    'You mark exam answers as strict JSON.',
    'Use the provided question, mark value, mark scheme, model answer, and subject context.',
    'Award integer marks from 0 up to maxMarks. Never exceed maxMarks.',
    'If the student answer is blank or irrelevant, award 0.',
    'MCQs are marked deterministically by the server, but you may still use them when writing the overall summary, weaknessAnalysis, and gradeBoostAdvice.',
    'For calculation questions, credit correct method, working, answer, and units where relevant. Do not require perfect wording if the method and answer are clear.',
    'For longer open-response questions, reward accurate knowledge, application to context, linked analysis, evaluation, and judgement where the mark value expects them.',
    'Return exactly one markedAnswers item per question, in the same order, using zero-based questionIndex values.',
    'Feedback should be specific to the student answer and should identify where marks were won or lost.',
    'weaknessAnalysis should aggregate repeated weaknesses across the whole attempt.',
    'gradeBoostAdvice should tell the student what to do next to raise the predicted grade by at least one level when they are not already at the top grade.',
    `Board: ${payload.examBoard}. Type: ${payload.examType}. Subject: ${payload.subject}.`,
    payload.specification ? `Specification focus: ${payload.specification}` : '',
    'Return JSON only and match the provided schema.',
  ]
    .filter(Boolean)
    .join('\n');

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
    'Mark this attempt:',
    JSON.stringify({ attempt }, null, 2),
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
      text: { format: { type: 'json_schema', name: 'exam_answer_marking', schema: SCHEMA, strict: true } },
    }),
  });

  if (responsesResponse.ok) {
    const body = (await responsesResponse.json()) as OpenAIResponseBody;
    const parsed = extractReportFromResponsesBody(body);
    if (!parsed) throw new Error('AI response was not valid marking JSON.');
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
          name: 'exam_answer_marking',
          schema: SCHEMA,
          strict: true,
        },
      },
    }),
  });

  if (!chatResponse.ok) {
    const chatErrorText = await chatResponse.text();
    throw new Error(`AI marking failed. /responses: ${responsesErrorText} | /chat/completions: ${chatErrorText}`);
  }

  const chatBody = (await chatResponse.json()) as ChatCompletionsResponseBody;
  const parsedField = tryExtractWithCoercer(chatBody.choices?.[0]?.message?.parsed, coerceMarkingReport, extractJson);
  if (parsedField) return parsedField;

  const parsed = extractJson(extractChatMessageText(chatBody));
  if (!parsed) throw new Error('AI chat/completions response was not valid marking JSON.');
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
