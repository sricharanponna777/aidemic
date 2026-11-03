import { NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { tryCreateAdminClient } from '@/lib/supabase-admin';
import { recordBlurtEvidence } from '@/lib/mastery/fromBlurt';
import { awardXp } from '@/lib/gamification/award';
import { buildAIHeaders, getAIConfig, getMissingHostedKeyError } from '@/lib/ai/config';
import {
  extractFromResponsesBody,
  extractJsonWithCoercer,
  tryExtractWithCoercer,
  type ChatCompletionsResponseBody,
  type OpenAIResponseBody,
} from '@/lib/ai/json';
import { AI_DAILY_LIMITS, checkAiRateLimit } from '@/lib/ai/rateLimit';
import { buildCourseSection, promptSection } from '@/lib/ai/courseContext';
import { MAX_AI_ERROR_TEXT, txt } from '@/lib/ai/text';

type BlurtPayload = {
  subject?: string;
  topic?: string;
  brainDump?: string;
  /** Course the recall is judged against; board and type also drive Learning Spine resolution. */
  examBoard?: string;
  examType?: string;
  /** Specification label, tier included ("... - Higher"). */
  specification?: string;
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
    const specification = txt(rawBody.specification || '', 280);

    if (!topic) return NextResponse.json({ error: 'A topic is required.' }, { status: 400 });
    if (brainDump.trim().length < 20) {
      return NextResponse.json({ error: 'Write a bit more before submitting your recall.' }, { status: 400 });
    }

    const config = getAIConfig();
    const missingKeyError = getMissingHostedKeyError(config);
    if (missingKeyError) return NextResponse.json({ error: missingKeyError }, { status: 500 });

    const system = [
      'You are a senior examiner for the exact course described below, reviewing a "blurting" (free-recall) exercise: the student has written down everything they can remember about one topic, and you judge how completely and accurately they recalled what this course requires.',
      promptSection('1. OUTPUT CONTRACT', [
        'Return ONLY one JSON object with exactly these fields, and nothing outside it:',
        '- "covered": the key points they correctly recalled. Each item names one point. 0-10 items; never pad it.',
        '- "missed": important points this course requires on this topic that they did not mention, most important first. 0-10 items.',
        '- "misconceptions": anything they wrote that is wrong or imprecise for this course. Each item names the error and gives the correction. 0-6 items.',
        '- "coverageScore": a whole number 0-100: the share of the topic\'s required content (weighted by importance) that they recalled correctly.',
        '- "summary": one encouraging sentence naming the single most useful next step.',
      ]),
      buildCourseSection({ examBoard, examType, subject, specification, topic }, 'assess'),
      promptSection('3. HOW TO JUDGE THE RECALL', [
        '- The reference is what this specification requires on this topic at this tier: no more, no less. Never list as "missed" a point that is outside this course or tier.',
        '- Only put a point in "covered" when the student actually wrote it, in their words or equivalent ones. Never infer what they meant, and never credit a point they did not write.',
        '- A point that is stated wrongly goes in "misconceptions", not "covered". A point that is right but vague is "covered" only if this course would credit it.',
        '- Every item in "missed" and every correction in "misconceptions" must be factually correct for this course. If unsure, leave it out.',
        '- Keep the arrays consistent: a point never appears in both "covered" and "missed".',
        '- coverageScore must agree with the arrays: lots covered and little missed scores high; little covered scores low; an empty or off-topic dump scores 0-10.',
        '- Be warm in tone but honest about gaps.',
      ]),
      promptSection('4. FINAL VALIDATION', [
        'Before responding, silently check every item against the student\'s text and this course, check the arrays do not overlap, and check coverageScore matches them. Fix anything that fails. Do not reveal this check.',
      ]),
    ].join('\n\n');

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
    // A point the student recalled cannot also be one they missed; the model
    // occasionally lists it in both, which shows them a contradiction.
    const coveredKeys = new Set(covered.map((s) => s.trim().toLowerCase()));
    const missed = result.missed
      .slice(0, 10)
      .map((s) => txt(s, 200))
      .filter((s) => !coveredKeys.has(s.trim().toLowerCase()));
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

    // Unlike the spine write, paid with or without an exam board: XP rewards
    // the recall itself, not its attribution to a subtopic.
    const xp = await awardXp(spineClient ?? tryCreateAdminClient(), authData.user.id, {
      source: 'blurt',
      score: result.coverageScore / 100,
    });

    return NextResponse.json({
      covered,
      missed,
      misconceptions,
      coverageScore: result.coverageScore,
      summary: txt(result.summary, 240),
      xp,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to review your recall.';
    return NextResponse.json({ error: txt(message, MAX_AI_ERROR_TEXT) }, { status: 500 });
  }
}
