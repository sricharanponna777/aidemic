import { NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { tryCreateAdminClient } from '@/lib/supabase-admin';
import { recordBlurtEvidence } from '@/lib/mastery/fromBlurt';
import { buildAIHeaders, getAIConfig, getMissingHostedKeyError } from '@/lib/ai/config';
import {
  extractFromResponsesBody,
  extractJsonWithCoercer,
  tryExtractWithCoercer,
  type ChatCompletionsResponseBody,
  type OpenAIResponseBody,
} from '@/lib/ai/json';
import { AI_DAILY_LIMITS, checkAiRateLimit } from '@/lib/ai/rateLimit';
import { MAX_AI_ERROR_TEXT, txt } from '@/lib/ai/text';

type BlurtPayload = {
  subject?: string;
  topic?: string;
  brainDump?: string;
  /** Learning Spine resolution only; not part of the review prompt. */
  examBoard?: string;
  examType?: string;
};

type BlurtResult = {
  covered: string[];
  missed: string[];
  misconceptions: string[];
  coverageScore: number;
  summary: string;
};

const MAX_DUMP_CHARS = 8000;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['covered', 'missed', 'misconceptions', 'coverageScore', 'summary'],
  properties: {
    covered: { type: 'array', items: { type: 'string' } },
    missed: { type: 'array', items: { type: 'string' } },
    misconceptions: { type: 'array', items: { type: 'string' } },
    coverageScore: { type: 'number' },
    summary: { type: 'string' },
  },
};

const coerceResult = (value: unknown): BlurtResult | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const strArr = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  if (
    Array.isArray(v.covered) &&
    Array.isArray(v.missed) &&
    Array.isArray(v.misconceptions) &&
    typeof v.summary === 'string'
  ) {
    return {
      covered: strArr(v.covered),
      missed: strArr(v.missed),
      misconceptions: strArr(v.misconceptions),
      coverageScore: Number.isFinite(v.coverageScore as number) ? Math.max(0, Math.min(100, Math.round(v.coverageScore as number))) : 0,
      summary: v.summary,
    };
  }
  return null;
};

const extractJson = (rawText: string): BlurtResult | null => extractJsonWithCoercer(rawText, coerceResult);

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { allowed } = await checkAiRateLimit(supabase, AI_DAILY_LIMITS.blurtReview);
    if (!allowed) return NextResponse.json({ error: 'Daily AI usage limit reached. Try again tomorrow.' }, { status: 429 });

    const rawBody = (await request.json()) as BlurtPayload;
    const subject = txt(rawBody.subject || '', 80);
    const topic = txt(rawBody.topic || '', 160);
    const brainDump = txt(rawBody.brainDump || '', MAX_DUMP_CHARS);
    const examBoard = txt(rawBody.examBoard || '', 40);
    const examType = txt(rawBody.examType || '', 40);

    if (!topic) return NextResponse.json({ error: 'A topic is required.' }, { status: 400 });
    if (brainDump.trim().length < 20) {
      return NextResponse.json({ error: 'Write a bit more before submitting your recall.' }, { status: 400 });
    }

    const config = getAIConfig();
    const missingKeyError = getMissingHostedKeyError(config);
    if (missingKeyError) return NextResponse.json({ error: missingKeyError }, { status: 500 });

    const system = [
      'You are a GCSE/A-Level examiner grading a "blurting" (free-recall) exercise: the student has written down everything they can remember about a topic, and you assess how completely and accurately they covered it.',
      'Compare their brain dump against what a strong specification answer for this topic would contain.',
      'Return strict JSON only with: "covered" (key points they correctly recalled, 3-10 concise items), "missed" (important spec points they omitted, 3-10 items), "misconceptions" (anything they stated that is wrong or imprecise, 0-6 items, each naming the error and the correction), "coverageScore" (0-100, how complete their recall was), and "summary" (one encouraging sentence with the single most useful next step).',
      'Be specific to the subject and topic. Do not invent that they wrote something they did not. Reward correct recall generously but be honest about gaps.',
    ].join('\n');

    const user = JSON.stringify({ subject, topic, brainDump }, null, 2);
    const commonHeaders = buildAIHeaders(config);

    let result: BlurtResult | null = null;

    if (!config.isOpenRouter) {
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
          text: { format: { type: 'json_schema', name: 'blurt_review', schema: SCHEMA, strict: true } },
        }),
      });
      if (responsesResponse.ok) {
        const body = (await responsesResponse.json()) as OpenAIResponseBody;
        result = extractFromResponsesBody(body, coerceResult, extractJson);
      }
    }

    if (!result) {
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
          ...(config.supportsJsonSchema
            ? { response_format: { type: 'json_schema', json_schema: { name: 'blurt_review', schema: SCHEMA, strict: true } } }
            : { response_format: { type: 'json_object' } }),
        }),
      });

      if (!chatResponse.ok) {
        const chatErrorText = await chatResponse.text();
        return NextResponse.json({ error: txt(chatErrorText || 'AI recall review failed.', MAX_AI_ERROR_TEXT) }, { status: 502 });
      }

      const chatBody = (await chatResponse.json()) as ChatCompletionsResponseBody;
      result = tryExtractWithCoercer(chatBody.choices?.[0]?.message?.parsed, coerceResult, extractJson);
      if (!result) {
        const content = chatBody.choices?.[0]?.message?.content;
        const textContent =
          typeof content === 'string'
            ? content
            : Array.isArray(content)
            ? content.map((p) => (p?.type === 'text' ? p.text || '' : '')).join('\n')
            : '';
        result = extractJson(textContent);
      }
    }

    if (!result) {
      return NextResponse.json({ error: 'AI did not return a valid recall review.' }, { status: 502 });
    }

    const covered = result.covered.slice(0, 10).map((s) => txt(s, 200));
    const missed = result.missed.slice(0, 10).map((s) => txt(s, 200));
    const misconceptions = result.misconceptions.slice(0, 6).map((s) => txt(s, 240));

    // Dual-write to the Learning Spine. Deferred with after() because it makes a
    // classification model call the student must not wait on, and skipped
    // entirely without an exam board -- resolveTopic cannot scope a topic name
    // to one specification without it, and a mis-scoped subtopic is worse than
    // no evidence at all.
    const spineClient = examBoard && examType ? tryCreateAdminClient() : null;
    if (spineClient) {
      const userId = authData.user.id;
      after(() =>
        recordBlurtEvidence(spineClient, userId, {
          subject,
          examBoard,
          examType,
          topic,
          covered,
          missed,
          misconceptions,
        })
      );
    }

    return NextResponse.json({
      covered,
      missed,
      misconceptions,
      coverageScore: result.coverageScore,
      summary: txt(result.summary, 240),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to review your recall.';
    return NextResponse.json({ error: txt(message, MAX_AI_ERROR_TEXT) }, { status: 500 });
  }
}
