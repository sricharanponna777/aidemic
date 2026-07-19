import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
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

type WeakTopicInput = { name?: string; avgScore?: number };
type ClassSummaryInput = {
  className?: string;
  avgScore?: number | null;
  completionRate?: number | null;
  weakTopics?: WeakTopicInput[];
  atRiskCount?: number;
  notStartedCount?: number;
};

type ClassSummaryPayload = { classes?: ClassSummaryInput[] };

type ClassNote = { className: string; note: string };
type SummaryResult = { headline: string; priorities: string[]; classNotes: ClassNote[] };

const MAX_CLASSES = 20;
const MAX_WEAK_TOPICS = 8;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'priorities', 'classNotes'],
  properties: {
    headline: { type: 'string' },
    priorities: {
      type: 'array',
      items: { type: 'string' },
    },
    classNotes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['className', 'note'],
        properties: {
          className: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
  },
};

const coerceSummary = (value: unknown): SummaryResult | null => {
  if (!value || typeof value !== 'object') return null;
  const direct = value as { headline?: unknown; priorities?: unknown; classNotes?: unknown };
  if (typeof direct.headline === 'string' && Array.isArray(direct.priorities) && Array.isArray(direct.classNotes)) {
    return {
      headline: direct.headline,
      priorities: direct.priorities.filter((p): p is string => typeof p === 'string'),
      classNotes: direct.classNotes.filter(
        (c): c is ClassNote => !!c && typeof c === 'object' && typeof (c as ClassNote).className === 'string' && typeof (c as ClassNote).note === 'string'
      ),
    };
  }
  return null;
};

const extractJson = (rawText: string): SummaryResult | null => extractJsonWithCoercer(rawText, coerceSummary);

const normalizePayload = (raw: ClassSummaryPayload): ClassSummaryInput[] =>
  (Array.isArray(raw.classes) ? raw.classes : []).slice(0, MAX_CLASSES).map((c) => ({
    className: txt(c.className || 'Class', 80),
    avgScore: typeof c.avgScore === 'number' ? Math.round(c.avgScore) : null,
    completionRate: typeof c.completionRate === 'number' ? Math.round(c.completionRate) : null,
    weakTopics: (Array.isArray(c.weakTopics) ? c.weakTopics : []).slice(0, MAX_WEAK_TOPICS).map((t) => ({
      name: txt(t.name || 'Topic', 100),
      avgScore: typeof t.avgScore === 'number' ? Math.round(t.avgScore) : 0,
    })),
    atRiskCount: Number.isFinite(c.atRiskCount) ? Math.max(0, Math.round(c.atRiskCount as number)) : 0,
    notStartedCount: Number.isFinite(c.notStartedCount) ? Math.max(0, Math.round(c.notStartedCount as number)) : 0,
  }));

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { allowed } = await checkAiRateLimit(supabase, AI_DAILY_LIMITS.classSummary);
    if (!allowed) return NextResponse.json({ error: 'Daily AI usage limit reached. Try again tomorrow.' }, { status: 429 });

    const rawBody = (await request.json()) as ClassSummaryPayload;
    const classes = normalizePayload(rawBody);
    if (classes.length === 0) {
      return NextResponse.json({ error: 'At least one class with data is required.' }, { status: 400 });
    }

    const config = getAIConfig();
    const missingKeyError = getMissingHostedKeyError(config);
    if (missingKeyError) {
      return NextResponse.json({ error: missingKeyError }, { status: 500 });
    }

    const system = [
      'You are an assistant for a secondary-school teacher, summarizing already-computed class performance data.',
      'Write a short, actionable "what to reteach this week" style summary from the class stats provided.',
      'Return strict JSON only: a one-sentence headline, 3-5 priorities (concrete actions, referencing specific topics/classes where useful), and one short note per class.',
      'Be specific and practical. Do not invent data not present in the input. Do not mention student names (none are given).',
    ].join('\n');

    const user = JSON.stringify({ classes }, null, 2);
    const commonHeaders = buildAIHeaders(config);

    let result: SummaryResult | null = null;

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
          text: { format: { type: 'json_schema', name: 'class_summary', schema: SCHEMA, strict: true } },
        }),
      });
      if (responsesResponse.ok) {
        const body = (await responsesResponse.json()) as OpenAIResponseBody;
        result = extractFromResponsesBody(body, coerceSummary, extractJson);
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
            ? { response_format: { type: 'json_schema', json_schema: { name: 'class_summary', schema: SCHEMA, strict: true } } }
            : { response_format: { type: 'json_object' } }),
        }),
      });

      if (!chatResponse.ok) {
        const chatErrorText = await chatResponse.text();
        return NextResponse.json({ error: txt(chatErrorText || 'AI summary failed.', MAX_AI_ERROR_TEXT) }, { status: 502 });
      }

      const chatBody = (await chatResponse.json()) as ChatCompletionsResponseBody;
      result = tryExtractWithCoercer(chatBody.choices?.[0]?.message?.parsed, coerceSummary, extractJson);
      if (!result) {
        const content = chatBody.choices?.[0]?.message?.content;
        const textContent =
          typeof content === 'string' ? content : Array.isArray(content) ? content.map((p) => (p?.type === 'text' ? p.text || '' : '')).join('\n') : '';
        result = extractJson(textContent);
      }
    }

    if (!result) {
      return NextResponse.json({ error: 'AI did not return a valid summary.' }, { status: 502 });
    }

    return NextResponse.json({
      headline: txt(result.headline, 200),
      priorities: result.priorities.slice(0, 5).map((p) => txt(p, 320)),
      classNotes: result.classNotes.slice(0, MAX_CLASSES).map((c) => ({ className: txt(c.className, 80), note: txt(c.note, 280) })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate class summary.';
    return NextResponse.json({ error: txt(message, MAX_AI_ERROR_TEXT) }, { status: 500 });
  }
}
