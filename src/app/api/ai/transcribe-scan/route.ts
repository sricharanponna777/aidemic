import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { buildAIHeaders, getMissingHostedKeyError, getVisionConfig } from '@/lib/ai/config';
import { AI_DAILY_LIMITS, checkAiRateLimit } from '@/lib/ai/rateLimit';
import { extractChatMessageText, extractJsonWithCoercer, tryExtractWithCoercer, type ChatCompletionsResponseBody } from '@/lib/ai/json';
import { MAX_AI_ERROR_TEXT } from '@/lib/ai/text';
import { promptSection } from '@/lib/ai/courseContext';
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

    // Deliberately no course, specification or tier here -- see the note at the
    // top of this file. Knowing what the answer "should" say is exactly what
    // makes a transcriber read it into the page.
    const system = [
      'You transcribe handwritten exam answers from photographs. You do not grade, correct, complete or improve them.',
      promptSection('1. OUTPUT CONTRACT', [
        '- Return ONLY one JSON object: {"answers": [{"questionIndex": integer, "text": string, "confidence": number}, ...]}.',
        '- Exactly one entry for EVERY question listed, with its zero-based questionIndex exactly as given, even when that question has no answer.',
        '- confidence is a number from 0 to 1 describing only how sure you are that you read the handwriting correctly. It says nothing about whether the answer is right.',
      ]),
      promptSection('2. TRANSCRIBE EXACTLY WHAT IS WRITTEN', [
        '- Copy the student\'s words as written, including spelling mistakes, wrong facts, wrong units, wrong arithmetic and unfinished sentences. Never fix, complete, reorder or improve anything.',
        '- Never add a word, number, symbol or unit that is not on the page, even when the intended answer seems obvious.',
        '- Keep calculation working line by line, in the order written. Write maths as the student wrote it, using plain text or LaTeX for notation (e.g. x^2, \\\\frac{a}{b}).',
        '- For a multiple-choice question, transcribe only the letter the student chose (A, B, C or D). Use "" if no choice is clearly marked, or if more than one is marked and none is crossed out.',
        '- Crossed-out text is not an answer: leave it out.',
        '- A word you cannot read at all: write [illegible] in its place and lower the confidence. Never guess a word and present it as read.',
        '- If a question has no answer on any page, return "" for it with confidence 0. Never invent an answer.',
      ]),
      promptSection('3. MATCHING ANSWERS TO QUESTIONS', [
        '- The pages are in order, and one answer may continue across a page break.',
        '- Use the question numbers the student wrote, and the position on the page, to decide which question an answer belongs to. If an answer cannot be confidently assigned, give it to the most likely question and lower that entry\'s confidence.',
        '- Never copy one answer into two entries.',
      ]),
    ].join('\n\n');

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
