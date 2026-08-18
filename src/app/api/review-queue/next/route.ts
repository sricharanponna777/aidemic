import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  comparePracticePriority,
  readDueSubtopics,
  readStudentMastery,
  readTopicSubtopics,
} from '@/lib/mastery/read';
import { studentStudiesTopic } from '@/lib/curriculum/enrolment';
import { buildAIHeaders, getAIConfig, getMissingHostedKeyError } from '@/lib/ai/config';
import {
  extractJsonWithCoercer,
  tryExtractWithCoercer,
  type ChatCompletionsResponseBody,
} from '@/lib/ai/json';
import { normalizeMathNotation } from '@/lib/ai/math';
import { AI_DAILY_LIMITS, checkAiRateLimit } from '@/lib/ai/rateLimit';
import { MAX_AI_ERROR_TEXT, safe, txt } from '@/lib/ai/text';
import type { SupportedSubject } from '@/lib/ai/validation';

/**
 * Generate one micro-question for the student's weakest due subtopic.
 *
 * The question is persisted before it is returned so that /answer can mark it
 * against what was actually asked. That is the whole point: the client is given
 * the answer key to render the reveal panel, so only the server can honestly
 * say whether the student got it right.
 *
 * Three ways to choose the target, in descending specificity:
 *
 *   subtopicId  Daily Review naming one item of a queue it already built.
 *   topicId     Study Chat checking understanding of the topic under discussion;
 *               `source: 'tutor'` prices the resulting evidence accordingly.
 *   neither     Whatever is most overdue.
 *
 * NOTE: the prompt below duplicates a slice of generate-questions/route.ts.
 * That route is ~1,200 lines of branching across plots, diagrams, English
 * papers and source material, none of which a one-question MCQ needs; carving
 * a shared generator out of it for this single caller would be a large,
 * risky refactor. Revisit if a third caller appears.
 */

type MicroQuestion = {
  question: string;
  options: string[];
  correctOption: 'A' | 'B' | 'C' | 'D';
  explanation: string;
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['question', 'options', 'correctOption', 'explanation'],
  properties: {
    question: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
    correctOption: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
    explanation: { type: 'string' },
  },
};

const coerceQuestion = (value: unknown): MicroQuestion | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const options = Array.isArray(v.options) ? v.options.filter((o): o is string => typeof o === 'string') : [];
  const correctOption = typeof v.correctOption === 'string' ? v.correctOption.trim().toUpperCase() : '';

  if (typeof v.question !== 'string' || !v.question.trim()) return null;
  if (options.length !== 4) return null;
  if (!['A', 'B', 'C', 'D'].includes(correctOption)) return null;

  return {
    question: v.question,
    options,
    correctOption: correctOption as MicroQuestion['correctOption'],
    explanation: typeof v.explanation === 'string' ? v.explanation : '',
  };
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { allowed } = await checkAiRateLimit(supabase, AI_DAILY_LIMITS.generateQuestions);
    if (!allowed) {
      return NextResponse.json({ error: 'Daily AI usage limit reached. Try again tomorrow.' }, { status: 429 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      subtopicId?: unknown;
      topicId?: unknown;
      source?: unknown;
    };
    const requestedSubtopicId = typeof payload.subtopicId === 'string' ? payload.subtopicId : '';
    const requestedTopicId = typeof payload.topicId === 'string' ? payload.topicId : '';
    const source = payload.source === 'tutor' ? 'tutor' : 'exam_practice';

    const userId = authData.user.id;
    let target;

    if (requestedSubtopicId) {
      // Reads through the caller's client, so RLS confines this to the student's
      // own mastery rows. A subtopic they have no row for simply does not
      // resolve -- which is why letting the client name one (so a queue can
      // cover several) stays safe.
      [target] = (await readStudentMastery(supabase, userId)).filter(
        (row) => row.subtopicId === requestedSubtopicId
      );
    } else if (requestedTopicId) {
      // Curriculum tables are public reference data, so a topic id proves
      // nothing on its own; this is what stops a crafted request seeding mastery
      // rows for a course the student does not take.
      if (!(await studentStudiesTopic(supabase, userId, requestedTopicId))) {
        return NextResponse.json({ error: 'That topic is not in your subjects.' }, { status: 403 });
      }

      // Read the whole topic, not just what the spine has measured: a student
      // asking the tutor about something has usually never been measured on it,
      // so requiring an existing mastery row would refuse exactly the questions
      // worth asking.
      const [all, measured] = await Promise.all([
        readTopicSubtopics(supabase, requestedTopicId),
        readStudentMastery(supabase, userId),
      ]);
      const known = new Map(
        measured.filter((row) => row.topicId === requestedTopicId).map((row) => [row.subtopicId, row])
      );

      // Cover the topic rather than drilling one corner of it. Answering builds
      // a mastery row, so ranking purely by weakness would re-serve whatever was
      // just asked -- one answer is not enough evidence to demote it. Walking
      // the never-asked subtopics in specification order first is what makes
      // "ask me another" move.
      const untouched = all.filter((row) => !known.has(row.subtopicId));
      target = untouched[0] ?? [...known.values()].sort(comparePracticePriority)[0];
    } else {
      [target] = await readDueSubtopics(supabase, userId, { limit: 1 });
    }

    if (!target) return NextResponse.json({ error: 'Nothing is due for review.' }, { status: 404 });

    const config = getAIConfig();
    const missingKeyError = getMissingHostedKeyError(config);
    if (missingKeyError) return NextResponse.json({ error: missingKeyError }, { status: 500 });

    const system = [
      'You write one short multiple-choice retrieval-practice question for a secondary or pre-university student.',
      'Return strict JSON only with: "question", "options" (exactly 4 plausible answers, no A)/B) prefixes), "correctOption" (one of A, B, C, D matching the option order), and "explanation" (one or two sentences on why the answer is right).',
      'Target the named subtopic precisely. Keep it answerable in under a minute. Make the distractors reflect genuine misconceptions rather than obvious throwaways.',
    ].join('\n');

    const user = JSON.stringify(
      {
        subject: target.scope.subject,
        examBoard: target.scope.examBoard,
        examType: target.scope.examType,
        specification: target.scope.specTier
          ? `${target.scope.specName} - ${target.scope.specTier}`
          : target.scope.specName,
        topic: target.topicName,
        subtopic: target.subtopicName,
      },
      null,
      2
    );

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: buildAIHeaders(config),
      body: JSON.stringify({
        model: config.model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...(config.supportsJsonSchema
          ? { response_format: { type: 'json_schema', json_schema: { name: 'micro_question', schema: SCHEMA, strict: true } } }
          : { response_format: { type: 'json_object' } }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: txt(errorText || 'Question generation failed.', MAX_AI_ERROR_TEXT) }, { status: 502 });
    }

    const body = (await response.json()) as ChatCompletionsResponseBody;
    let question = tryExtractWithCoercer(body.choices?.[0]?.message?.parsed, coerceQuestion, (raw) =>
      extractJsonWithCoercer(raw, coerceQuestion)
    );
    if (!question) {
      const content = body.choices?.[0]?.message?.content;
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
          ? content.map((part) => (part?.type === 'text' ? part.text || '' : '')).join('\n')
          : '';
      question = extractJsonWithCoercer(text, coerceQuestion);
    }
    if (!question) return NextResponse.json({ error: 'AI did not return a valid question.' }, { status: 502 });

    const subject = target.scope.subject as SupportedSubject;
    const stored: MicroQuestion = {
      question: normalizeMathNotation(safe(question.question), subject),
      options: question.options.map((option) => normalizeMathNotation(safe(option), subject)),
      correctOption: question.correctOption,
      explanation: normalizeMathNotation(safe(question.explanation), subject),
    };

    // Service role: review_queue_items is deny-all, so the student's own client
    // cannot write here -- which is what stops the answer key being editable.
    const { data: item, error: insertError } = await createAdminClient()
      .from('review_queue_items')
      .insert({ user_id: userId, subtopic_id: target.subtopicId, question: stored, source })
      .select('id')
      .single();

    if (insertError || !item) {
      return NextResponse.json({ error: 'Could not start this question.' }, { status: 500 });
    }

    return NextResponse.json({
      itemId: item.id,
      subtopicName: target.subtopicName,
      topicName: target.topicName,
      subject: target.scope.subject,
      question: stored,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build a review question.';
    return NextResponse.json({ error: txt(message, MAX_AI_ERROR_TEXT) }, { status: 500 });
  }
}
