import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { buildAIHeaders, getAIConfig, getMissingHostedKeyError } from '@/lib/ai/config';
import { extractFromResponsesBody, extractJsonWithCoercer, tryExtractWithCoercer, type OpenAIResponseBody, type ChatCompletionsResponseBody } from '@/lib/ai/json';
import { normalizeMathNotation } from '@/lib/ai/math';
import { MAX_AI_ERROR_TEXT, safe, txt } from '@/lib/ai/text';
import {
  clampCount,
  normalizeBoard,
  normalizeExamType,
  normalizeSubject,
  SUPPORTED_EXAM_BOARDS,
  SUPPORTED_EXAM_TYPES,
  SUPPORTED_SUBJECTS,
  type SupportedSubject,
} from '@/lib/ai/validation';

type FlashcardPayload = {
  name?: string;
  description?: string;
  topic?: string;
  subject?: string;
  examBoard?: string;
  examType?: string;
  specification?: string;
  prompt?: string;
  cardCount?: number;
};

type FlashcardItem = {
  front: string;
  back: string;
  tags?: string[];
};

const MIN_CARDS = 6;
const MAX_CARDS = 40;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['deckName', 'flashcards'],
  properties: {
    deckName: { type: 'string' },
    flashcards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['front', 'back', 'tags'],
        properties: {
          front: { type: 'string' },
          back: { type: 'string' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  },
};

const coerceGeneratedFlashcards = (value: unknown): { flashcards: FlashcardItem[]; deckName?: string } | null => {
  if (!value || typeof value !== 'object') return null;
  const direct = value as { flashcards?: unknown; deckName?: unknown };
  if (Array.isArray(direct.flashcards)) {
    return {
      flashcards: direct.flashcards as FlashcardItem[],
      deckName: typeof direct.deckName === 'string' ? direct.deckName : undefined,
    };
  }
  const nestedCandidates = Object.values(value as Record<string, unknown>);
  for (const candidate of nestedCandidates) {
    if (candidate && typeof candidate === 'object') {
      const nested = candidate as { flashcards?: unknown; deckName?: unknown };
      if (Array.isArray(nested.flashcards)) {
        return {
          flashcards: nested.flashcards as FlashcardItem[],
          deckName: typeof nested.deckName === 'string' ? nested.deckName : undefined,
        };
      }
    }
  }
  return null;
};

const extractJson = (rawText: string): { flashcards: FlashcardItem[]; deckName?: string } | null =>
  extractJsonWithCoercer(rawText, coerceGeneratedFlashcards);

const tryExtractFromUnknown = (value: unknown) => {
  return tryExtractWithCoercer(value, coerceGeneratedFlashcards, extractJson);
};

const extractFlashcardsFromResponsesBody = (body: OpenAIResponseBody) => {
  return extractFromResponsesBody(body, coerceGeneratedFlashcards, extractJson);
};

const normalizePayload = (raw: FlashcardPayload) => ({
  name: txt(raw.name || '', 120),
  description: txt(raw.description || '', 280),
  topic: txt(raw.topic || '', 200),
  subject: normalizeSubject(raw.subject),
  examBoard: normalizeBoard(raw.examBoard),
  examType: normalizeExamType(raw.examType),
  specification: txt(raw.specification || '', 280),
  prompt: txt(raw.prompt || '', 2000),
  cardCount: clampCount(raw.cardCount, MIN_CARDS, MAX_CARDS, 12),
});

const normalizeCard = (item: FlashcardItem, subject: SupportedSubject | null): FlashcardItem | null => {
  const front = normalizeMathNotation(safe(item.front || ''), subject);
  const back = normalizeMathNotation(safe(item.back || ''), subject);
  const card = {
    front: txt(front, 520),
    back: txt(back, 520),
    tags: Array.isArray(item.tags) ? item.tags.map(tag => txt(safe(tag), 50)).filter(tag => tag.length > 0) : [],
  };
  if (!card.front || !card.back) return null;
  return card;
};

const aiGenerate = async (payload: ReturnType<typeof normalizePayload>): Promise<{ flashcards: FlashcardItem[]; deckName?: string }> => {
  const config = getAIConfig();

  const system = [
    'You generate concise study flashcards as strict JSON.',
    'Do not include any extra text or commentary outside the JSON object.',
    'Return a JSON object with deckName and flashcards array.',
    'deckName should be a concise, descriptive title for the flashcard deck.',
    'For each flashcard, include front, back, and relevant tags.',
    'Do not include HTML tags in the flashcard text.',
    'For each flashcard, choose tags that match the card content. Tags must reflect the task or format of the question, not just the subject area.',
    'Valid tags are: application, recall, calculation, definition, 3-marker, concept, formula, process, diagram, example, comparison, analysis.',
    'If a card asks to state, explain, or identify something, use definition, concept, or recall — do not use process or calculation unless the card specifically asks for a procedure or numeric working.',
    'If a card asks how to use an idea, solve a problem, or apply knowledge, use application or calculation as appropriate.',
    'Only use comparison when the card explicitly asks to compare two or more items, processes, concepts, or methods. Do not use comparison for a simple definition or explanation question.',
    'If it asks for reasoning, use analysis. If it asks for a diagram, use diagram.',
    'Use only the most relevant 1-3 tags per flashcard.',
    'When writing math, use explicit LaTeX with grouping and brackets.',
    'Every math expression must be wrapped for rendering: use \\\\(...\\\\) for inline math and \\\\[...\\\\] for display math. Do not leave bare LaTeX in prose.',
    'Because the response is JSON, escape every LaTeX backslash as a double backslash, for example \\\\(\\\\binom{7}{4}a^{3}b^{4}\\\\), \\\\(\\\\frac{1}{2}\\\\), \\\\(\\\\text{det}(A)\\\\), \\\\[A=\\\\begin{pmatrix}a & b \\\\\\\\ c & d\\\\end{pmatrix}\\\\].',
    'Always bracket powers/subscripts inside math delimiters: x^{2}, a_{n+1}, (ab)^{2}, x_{(i+1)}.',
    'Use grouped fractions: \\frac{numerator}{denominator}, e.g. \\frac{(x^{4}y^{2})}{(xy^{3})}.',
    'Never use ambiguous shorthand such as x2, xy3, x^n+1, or (x4y^2)/(xy3).',
    `Board: ${payload.examBoard}. Type: ${payload.examType}. Subject: ${payload.subject}.`,
    payload.specification ? `Specification focus: ${payload.specification}` : '',
    `Topic: ${payload.topic}.`,
    `Generate ${payload.cardCount} flashcards using the prompt requirements below.`,
  ]
    .filter(Boolean)
    .join('\n');

  const user = [
    `Prompt: ${payload.prompt}`,
    `Deck name: ${payload.name}`,
    `If no deck name is provided, generate a concise descriptive deck title based on topic, exam board, and subject.`,
    `Use the selected exam board and syllabus when writing each card.`,
    `Assign appropriate tags to each flashcard to help with organization and study.`,
  ].join('\n\n');

  const commonHeaders = buildAIHeaders(config);

  const responsesResponse = await fetch(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      model: config.model,
      temperature: 0.4,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: system }] },
        { role: 'user', content: [{ type: 'input_text', text: user }] },
      ],
      text: { format: { type: 'json_schema', name: 'flashcards', schema: SCHEMA, strict: true } },
    }),
  });

  if (responsesResponse.ok) {
    const body = (await responsesResponse.json()) as OpenAIResponseBody;
    const parsed = extractFlashcardsFromResponsesBody(body);
    if (!parsed) throw new Error('AI response was not valid flashcard JSON.');
    return parsed;
  }

  const responsesErrorText = await responsesResponse.text();
  const chatResponse = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      model: config.model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'flashcards',
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
      ? content.map((part) => (part?.type === 'text' ? part.text || '' : '')).join('\n')
      : '';
  const parsed = extractJson(textContent);
  if (!parsed) throw new Error('AI chat/completions response was not valid flashcard JSON.');
  return parsed;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = (await request.json()) as FlashcardPayload;
    const payload = normalizePayload(rawBody);

    if (!payload.topic) {
      return NextResponse.json({ error: 'Topic is required.' }, { status: 400 });
    }
    if (!payload.subject) {
      return NextResponse.json({ error: `Subject must be one of: ${SUPPORTED_SUBJECTS.join(', ')}.` }, { status: 400 });
    }
    if (!payload.examBoard || !SUPPORTED_EXAM_BOARDS.includes(payload.examBoard)) {
      return NextResponse.json({ error: 'Exam board must be one of: AQA, Edexcel, OCR.' }, { status: 400 });
    }
    if (!payload.examType || !SUPPORTED_EXAM_TYPES.includes(payload.examType)) {
      return NextResponse.json({ error: 'Exam type must be GCSE or A-Level.' }, { status: 400 });
    }
    if (!payload.prompt || payload.prompt.length < 20) {
      return NextResponse.json({ error: 'A detailed prompt is required.' }, { status: 400 });
    }

    const config = getAIConfig();
    const missingKeyError = getMissingHostedKeyError(config);
    if (missingKeyError) {
      return NextResponse.json({ error: missingKeyError }, { status: 500 });
    }

    const aiResult = await aiGenerate(payload);
    const normalizedCards = (Array.isArray(aiResult.flashcards) ? aiResult.flashcards : [])
      .map((item) => normalizeCard(item, payload.subject))
      .filter((item): item is FlashcardItem => item !== null);

    if (normalizedCards.length === 0) {
      return NextResponse.json({ error: 'AI did not return valid flashcards.' }, { status: 502 });
    }

    const uniqueCards: FlashcardItem[] = [];
    const seen = new Set<string>();
    for (const card of normalizedCards) {
      if (uniqueCards.length >= payload.cardCount) break;
      const key = `${card.front.toLowerCase()}|${card.back.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueCards.push(card);
    }

    if (uniqueCards.length === 0) {
      return NextResponse.json({ error: 'No usable flashcards were generated.' }, { status: 502 });
    }

    // Use AI-generated deck name if no name provided, or fallback to a default
    const deckName = payload.name || aiResult.deckName || `${payload.topic || 'AI Generated'} Flashcards`;

    const { data: deckData, error: deckError } = await supabase
      .from('flashcard_decks')
      .insert([
        {
          user_id: authData.user.id,
          name: txt(deckName, 120),
          description: payload.description || null,
          card_count: uniqueCards.length,
          ai_generated: true,
          ai_prompt: payload.prompt,
        },
      ])
      .select()
      .single();

    if (deckError || !deckData) {
      return NextResponse.json({ error: deckError?.message || 'Failed to create deck.' }, { status: 500 });
    }

    const now = new Date();

    const cardsToInsert = uniqueCards.map((card) => ({
      deck_id: deckData.id,
      front: card.front,
      back: card.back,
      ai_generated: true,
      ease_factor: 2.5,
      interval_days: 1,
      next_review_date: now.toISOString(),
      repetition_count: 0,
      consecutive_correct: 0,
    }));

    const { error: cardsError } = await supabase.from('flashcards').insert(cardsToInsert);
    if (cardsError) {
      return NextResponse.json({ error: cardsError.message || 'Failed to save flashcards.' }, { status: 500 });
    }

    // Create tags and tag mappings
    const allTags = new Set<string>();
    uniqueCards.forEach(card => {
      card.tags?.forEach(tag => allTags.add(tag.toLowerCase().trim()));
    });

    if (allTags.size > 0) {
      const tagColors = ['#2563eb', '#0f766e', '#7c3aed', '#be123c', '#b45309', '#0284c7', '#059669', '#dc2626', '#7c2d12'];
      const tagsToCreate = Array.from(allTags).map((tagName, index) => ({
        deck_id: deckData.id,
        name: tagName,
        color: tagColors[index % tagColors.length],
      }));

      const { data: createdTags, error: tagsError } = await supabase
        .from('flashcard_tags')
        .insert(tagsToCreate)
        .select();

      if (tagsError) {
        console.error('Failed to create tags:', tagsError);
        // Don't fail the request, just log the error
      } else if (createdTags) {
        // Create tag mappings for each flashcard
        const tagMappings: Array<{ flashcard_id: string; tag_id: string }> = [];

        // Get the inserted flashcards to map them to tags
        const { data: insertedCards } = await supabase
          .from('flashcards')
          .select('id, front, back')
          .eq('deck_id', deckData.id)
          .order('created_at', { ascending: false })
          .limit(uniqueCards.length);

        if (insertedCards) {
          uniqueCards.forEach((card, index) => {
            const insertedCard = insertedCards[uniqueCards.length - 1 - index]; // Reverse order due to DESC
            if (insertedCard && card.tags) {
              card.tags.forEach(tagName => {
                const tag = createdTags.find(t => t.name === tagName.toLowerCase().trim());
                if (tag) {
                  tagMappings.push({
                    flashcard_id: insertedCard.id,
                    tag_id: tag.id,
                  });
                }
              });
            }
          });

          if (tagMappings.length > 0) {
            const { error: mappingError } = await supabase
              .from('flashcard_tag_mapping')
              .insert(tagMappings);

            if (mappingError) {
              console.error('Failed to create tag mappings:', mappingError);
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, deckId: deckData.id, created: cardsToInsert.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate flashcards.';
    return NextResponse.json({ error: txt(message, MAX_AI_ERROR_TEXT) }, { status: 500 });
  }
}
