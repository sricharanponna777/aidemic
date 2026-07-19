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

type BandCount = { band?: string; count?: number };
type WeaknessInput = { tag?: string; count?: number; subjects?: string[] };
type SubjectStatInput = { subject?: string; attempts?: number; avgPercentage?: number; trend?: string };

type CoachPayload = {
  totalAttempts?: number;
  totalQuestionsAnalyzed?: number;
  bandDistribution?: BandCount[];
  topWeaknesses?: WeaknessInput[];
  subjects?: SubjectStatInput[];
};

type CoachResult = { headline: string; patterns: string[]; nextSteps: string[] };

const MAX_WEAKNESSES = 10;
const MAX_SUBJECTS = 12;
const MAX_BANDS = 8;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'patterns', 'nextSteps'],
  properties: {
    headline: { type: 'string' },
    patterns: {
      type: 'array',
      items: { type: 'string' },
    },
    nextSteps: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};

const coerceResult = (value: unknown): CoachResult | null => {
  if (!value || typeof value !== 'object') return null;
  const direct = value as { headline?: unknown; patterns?: unknown; nextSteps?: unknown };
  if (typeof direct.headline === 'string' && Array.isArray(direct.patterns) && Array.isArray(direct.nextSteps)) {
    return {
      headline: direct.headline,
      patterns: direct.patterns.filter((p): p is string => typeof p === 'string'),
      nextSteps: direct.nextSteps.filter((p): p is string => typeof p === 'string'),
    };
  }
  return null;
};

const extractJson = (rawText: string): CoachResult | null => extractJsonWithCoercer(rawText, coerceResult);

const normalizePayload = (raw: CoachPayload) => ({
  totalAttempts: Number.isFinite(raw.totalAttempts) ? Math.max(0, Math.round(raw.totalAttempts as number)) : 0,
  totalQuestionsAnalyzed: Number.isFinite(raw.totalQuestionsAnalyzed) ? Math.max(0, Math.round(raw.totalQuestionsAnalyzed as number)) : 0,
  bandDistribution: (Array.isArray(raw.bandDistribution) ? raw.bandDistribution : []).slice(0, MAX_BANDS).map((b) => ({
    band: txt(b.band || 'Unknown', 40),
    count: Number.isFinite(b.count) ? Math.max(0, Math.round(b.count as number)) : 0,
  })),
  topWeaknesses: (Array.isArray(raw.topWeaknesses) ? raw.topWeaknesses : []).slice(0, MAX_WEAKNESSES).map((w) => ({
    tag: txt(w.tag || 'Weakness', 120),
    count: Number.isFinite(w.count) ? Math.max(0, Math.round(w.count as number)) : 0,
    subjects: (Array.isArray(w.subjects) ? w.subjects : []).slice(0, 5).map((s) => txt(s, 60)),
  })),
  subjects: (Array.isArray(raw.subjects) ? raw.subjects : []).slice(0, MAX_SUBJECTS).map((s) => ({
    subject: txt(s.subject || 'Subject', 60),
    attempts: Number.isFinite(s.attempts) ? Math.max(0, Math.round(s.attempts as number)) : 0,
    avgPercentage: Number.isFinite(s.avgPercentage) ? Math.round(s.avgPercentage as number) : 0,
    trend: txt(s.trend || 'steady', 20),
  })),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { allowed } = await checkAiRateLimit(supabase, AI_DAILY_LIMITS.examCoach);
    if (!allowed) return NextResponse.json({ error: 'Daily AI usage limit reached. Try again tomorrow.' }, { status: 429 });

    const rawBody = (await request.json()) as CoachPayload;
    const input = normalizePayload(rawBody);
    if (input.totalAttempts === 0) {
      return NextResponse.json({ error: 'At least one marked practice attempt is required.' }, { status: 400 });
    }

    const config = getAIConfig();
    const missingKeyError = getMissingHostedKeyError(config);
    if (missingKeyError) {
      return NextResponse.json({ error: missingKeyError }, { status: 500 });
    }

    const system = [
      'You are an exam-technique coach for a GCSE/A-Level student, working only from already-computed performance statistics (no raw answers are given to you).',
      'Identify recurring, mark-scheme-language patterns in why this student loses marks (e.g. "not using command-word-appropriate depth", "answers lack named evidence", "skips evaluation/judgement steps"), grounded only in the weakness tags and band distribution provided.',
      'Return strict JSON only: a one-sentence headline, 3-6 "patterns" (each a specific, mark-scheme-flavoured diagnosis referencing the data given), and 3-6 "nextSteps" (concrete, actionable revision steps the student can take this week).',
      'Be specific and encouraging, not generic. Do not invent data not present in the input. Reference subjects/topics by name where useful.',
    ].join('\n');

    const user = JSON.stringify(input, null, 2);
    const commonHeaders = buildAIHeaders(config);

    let result: CoachResult | null = null;

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
          text: { format: { type: 'json_schema', name: 'exam_coach', schema: SCHEMA, strict: true } },
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
            ? { response_format: { type: 'json_schema', json_schema: { name: 'exam_coach', schema: SCHEMA, strict: true } } }
            : { response_format: { type: 'json_object' } }),
        }),
      });

      if (!chatResponse.ok) {
        const chatErrorText = await chatResponse.text();
        return NextResponse.json({ error: txt(chatErrorText || 'AI coach report failed.', MAX_AI_ERROR_TEXT) }, { status: 502 });
      }

      const chatBody = (await chatResponse.json()) as ChatCompletionsResponseBody;
      result = tryExtractWithCoercer(chatBody.choices?.[0]?.message?.parsed, coerceResult, extractJson);
      if (!result) {
        const content = chatBody.choices?.[0]?.message?.content;
        const textContent =
          typeof content === 'string' ? content : Array.isArray(content) ? content.map((p) => (p?.type === 'text' ? p.text || '' : '')).join('\n') : '';
        result = extractJson(textContent);
      }
    }

    if (!result) {
      return NextResponse.json({ error: 'AI did not return a valid exam-technique report.' }, { status: 502 });
    }

    return NextResponse.json({
      headline: txt(result.headline, 200),
      patterns: result.patterns.slice(0, 6).map((p) => txt(p, 320)),
      nextSteps: result.nextSteps.slice(0, 6).map((p) => txt(p, 320)),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate exam-technique report.';
    return NextResponse.json({ error: txt(message, MAX_AI_ERROR_TEXT) }, { status: 500 });
  }
}
