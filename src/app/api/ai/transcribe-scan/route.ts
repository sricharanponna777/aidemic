import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { buildAIHeaders, getMissingHostedKeyError, getVisionConfig } from '@/lib/ai/config';
import { AI_DAILY_LIMITS, checkAiRateLimit } from '@/lib/ai/rateLimit';
import { extractChatMessageText, extractJsonWithCoercer, tryExtractWithCoercer, type ChatCompletionsResponseBody } from '@/lib/ai/json';
import { MAX_AI_ERROR_TEXT } from '@/lib/ai/text';
import { loadOwnedPaper } from '@/lib/papers/loadPaper';
import { MAX_PAPER_PAGES, PAPER_SCANS_BUCKET } from '@/lib/papers/constants';
import { coerceTranscript } from '@/lib/papers/transcript';
import type { PaperQuestion, PaperTranscriptEntry } from '@/types';

/**
 * Read a student's handwriting off their uploaded pages, per question.
 *
 * This route transcribes and nothing else -- it does not decide a single mark.
 * Keeping the two apart is what makes a scanned attempt defensible: the student
 * sees exactly what the model read before any of it is graded, and can correct
 * a misread digit rather than argue with a mark afterwards. It also leaves
 * /api/ai/mark-answers completely unchanged for the typed path.
 *
 * The prompt is given the question text and mark values but NEVER the mark
 * scheme or model answer. A model shown the answer transcribes the answer it
 * was shown: the blank page comes back as a beautiful response, and the student
 * is marked on the mark scheme rather than on their own work.
 */

const MAX_OUTPUT_TOKENS = 4000;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answers'],
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['questionIndex', 'text', 'confidence'],
        properties: {
          questionIndex: { type: 'integer' },
          text: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
  },
} as const;

const coerceAnswers = (value: unknown): PaperTranscriptEntry[] | null => {
  if (!value || typeof value !== 'object') return null;
  const answers = (value as { answers?: unknown }).answers;
  return Array.isArray(answers) ? (answers as PaperTranscriptEntry[]) : null;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as { paperId?: unknown };
    const paperId = typeof body.paperId === 'string' ? body.paperId : '';
    if (!paperId) return NextResponse.json({ error: 'paperId is required.' }, { status: 400 });

    const config = getVisionConfig();
    const missingKeyError = getMissingHostedKeyError(config);
    if (missingKeyError) return NextResponse.json({ error: missingKeyError }, { status: 500 });

    const { allowed } = await checkAiRateLimit(supabase, AI_DAILY_LIMITS.transcribeScan);
    if (!allowed) {
      return NextResponse.json({ error: 'Daily AI usage limit reached. Try again tomorrow.' }, { status: 429 });
    }

    const admin = createAdminClient();
    const paper = await loadOwnedPaper(admin, paperId, authData.user.id);
    if (!paper) return NextResponse.json({ error: 'Paper not found.' }, { status: 404 });
    if (paper.status === 'marked') {
      return NextResponse.json({ error: 'This paper has already been marked.' }, { status: 409 });
    }

    const pages = [...(paper.printed_paper_pages ?? [])]
      .sort((a, b) => a.page_index - b.page_index)
      .slice(0, MAX_PAPER_PAGES);
    if (pages.length === 0) {
      return NextResponse.json({ error: 'Upload a photo of your written pages first.' }, { status: 400 });
    }

    const questions = (paper.questions_payload ?? []) as PaperQuestion[];
    if (questions.length === 0) return NextResponse.json({ error: 'This paper has no questions.' }, { status: 400 });

    // Download with the service role: the bucket is private, and handing a
    // signed URL to a third-party provider would put a readable link to a
    // child's handwriting in someone else's logs.
    const images: string[] = [];
    for (const page of pages) {
      const { data, error } = await admin.storage.from(PAPER_SCANS_BUCKET).download(page.storage_path);
      if (error || !data) {
        console.error('[transcribe-scan] page download failed', page.storage_path, error);
        return NextResponse.json({ error: 'Could not read one of your uploaded pages.' }, { status: 500 });
      }
      const base64 = Buffer.from(await data.arrayBuffer()).toString('base64');
      images.push(`data:${data.type || 'image/jpeg'};base64,${base64}`);
    }

    const system = [
      'You transcribe handwritten exam answers from photographs. You do not grade, correct, complete or improve them.',
      'Transcribe exactly what is written, including spelling mistakes, wrong units and unfinished sentences.',
      'Keep the student\'s working for calculations, line by line, in the order written.',
      'For a multiple-choice question, transcribe only the letter the student chose (A, B, C or D); use "" if none is clearly marked.',
      'Crossed-out text is not an answer: ignore it.',
      'If a question has no answer on any page, return an empty string for it with confidence 0. Never invent an answer.',
      'confidence is 0-1 and describes how sure you are that you read the handwriting correctly, nothing else.',
      'The pages are in order and one answer may continue across a page break.',
      'Return one entry per question, zero-based questionIndex. Return JSON only.',
    ].join(' ');

    // Question text and marks only -- see the note at the top of this file.
    const questionList = questions.map((question, index) => ({
      questionIndex: index,
      questionType: question.questionType,
      question: question.question,
      marks: question.marks,
      ...(question.questionType === 'mcq' ? { options: question.options } : {}),
    }));

    const userContent = [
      {
        type: 'text',
        text: `Paper code ${paper.paper_code}. Transcribe the student's answers to these ${questions.length} questions:\n${JSON.stringify(questionList, null, 2)}`,
      },
      ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
    ];

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: buildAIHeaders(config),
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        ...(config.supportsJsonSchema
          ? { response_format: { type: 'json_schema', json_schema: { name: 'paper_transcription', schema: SCHEMA, strict: true } } }
          : { response_format: { type: 'json_object' } }),
      }),
    });

    if (!response.ok) {
      const errorText = (await response.text()).slice(0, MAX_AI_ERROR_TEXT);
      console.error('[transcribe-scan] provider error', errorText);
      return NextResponse.json({ error: 'Could not read your pages. Try again in a moment.' }, { status: 502 });
    }

    const responseBody = (await response.json()) as ChatCompletionsResponseBody;
    const extractText = (text: string) => extractJsonWithCoercer(text, coerceAnswers);
    const raw =
      tryExtractWithCoercer(responseBody.choices?.[0]?.message?.parsed, coerceAnswers, extractText) ??
      extractText(extractChatMessageText(responseBody));

    if (!raw) {
      console.error('[transcribe-scan] invalid JSON', {
        finishReason: responseBody.choices?.[0]?.finish_reason,
        usage: responseBody.usage,
      });
      return NextResponse.json({ error: 'Could not read your pages. Try again in a moment.' }, { status: 502 });
    }

    const transcript = coerceTranscript(raw, questions.length);

    const { error: saveError } = await admin
      .from('printed_papers')
      .update({ transcript_payload: transcript, status: 'transcribed', updated_at: new Date().toISOString() })
      .eq('id', paperId);

    if (saveError) {
      console.error('[transcribe-scan] save failed', saveError);
      return NextResponse.json({ error: 'Could not save the transcription.' }, { status: 500 });
    }

    return NextResponse.json({ transcript });
  } catch (err) {
    console.error('[transcribe-scan] failed', err);
    return NextResponse.json({ error: 'Could not read your pages. Try again in a moment.' }, { status: 500 });
  }
}
