import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

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

const SUPPORTED_SUBJECTS = [
  'biology',
  'chemistry',
  'physics',
  'mathematics',
  'english',
  'history',
  'geography',
  'economics',
  'psychology',
  'business',
  'computer science',
] as const;

type SupportedSubject = (typeof SUPPORTED_SUBJECTS)[number];

type SupportedBoard = 'aqa' | 'edexcel' | 'ocr';
type SupportedExamType = 'gcse' | 'a-level';

const SUPPORTED_EXAM_BOARDS: SupportedBoard[] = ['aqa', 'edexcel', 'ocr'];
const SUPPORTED_EXAM_TYPES: SupportedExamType[] = ['gcse', 'a-level'];

type OpenAIResponseBody = {
  output_text?: string;
  output?: Array<{ content?: Array<{ json?: unknown; text?: string; type?: string }> }>;
};

type ChatCompletionsResponseBody = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      parsed?: unknown;
    };
  }>;
};

const MIN_CARDS = 6;
const MAX_CARDS = 40;
const MAX_TEXT = 2400;
const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

const txt = (s: string, len: number) =>
  s
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, len);

const safe = (s: string) =>
  s
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<[^>]*>/g, '');

const extractFirstJsonObject = (text: string) => {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return '';
};

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

const extractJson = (rawText: string): { flashcards: FlashcardItem[]; deckName?: string } | null => {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return coerceGeneratedFlashcards(parsed);
  } catch {
    const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i) || trimmed.match(/```\s*([\s\S]*?)\s*```/i);
    if (fenceMatch?.[1]) {
      try {
        const parsed = JSON.parse(fenceMatch[1]) as unknown;
        const coerced = coerceGeneratedFlashcards(parsed);
        if (coerced) return coerced;
      } catch {
        // ignore
      }
    }
    const candidate = extractFirstJsonObject(trimmed);
    if (!candidate) return null;
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return coerceGeneratedFlashcards(parsed);
    } catch {
      return null;
    }
  }
};

const tryExtractFromUnknown = (value: unknown) => {
  const coerced = coerceGeneratedFlashcards(value);
  if (coerced) return coerced;
  if (typeof value === 'string') return extractJson(value);
  return null;
};

const extractFlashcardsFromResponsesBody = (body: OpenAIResponseBody) => {
  const direct = extractJson(typeof body.output_text === 'string' ? body.output_text : '');
  if (direct) return direct;
  if (!Array.isArray(body.output)) return null;
  for (const item of body.output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const entry of content) {
      const fromJson = tryExtractFromUnknown(entry.json);
      if (fromJson) return fromJson;
      const fromText = extractJson(entry.text || '');
      if (fromText) return fromText;
    }
  }
  return null;
};

const normalizeBoard = (value?: string): SupportedBoard | null => {
  const cleaned = txt(value || '', 24).toLowerCase().replace(/\s+/g, '');
  if (cleaned === 'aqa') return 'aqa';
  if (cleaned === 'edexcel') return 'edexcel';
  if (cleaned === 'ocr') return 'ocr';
  return null;
};

const normalizeExamType = (value?: string): SupportedExamType | null => {
  const cleaned = txt(value || '', 24).toLowerCase().replace(/\s+/g, '');
  if (cleaned === 'gcse') return 'gcse';
  if (cleaned === 'a-level' || cleaned === 'alevel') return 'a-level';
  return null;
};

const normalizeSubject = (value?: string): SupportedSubject | null => {
  const cleaned = txt(value || '', 120).toLowerCase();
  return SUPPORTED_SUBJECTS.includes(cleaned as SupportedSubject) ? (cleaned as SupportedSubject) : null;
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
  cardCount: typeof raw.cardCount === 'number' && Number.isFinite(raw.cardCount)
    ? Math.min(Math.max(Math.floor(raw.cardCount), MIN_CARDS), MAX_CARDS)
    : 12,
});

const normalizeBaseUrl = (value?: string) => {
  const raw = txt(value || '', 400);
  if (!raw) return OPENAI_DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, '');
};

const getAIConfig = () => {
  const baseUrl = normalizeBaseUrl(process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || OPENAI_DEFAULT_BASE_URL);
  const apiKey = txt(process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '', 300);
  const model = txt(process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini', 120);
  const isOpenAIHosted = /api\.openai\.com/i.test(baseUrl);
  const isOpenRouter = /openrouter\.ai/i.test(baseUrl);
  const openRouterSiteUrl = txt(process.env.OPENROUTER_SITE_URL || '', 200);
  const openRouterAppName = txt(process.env.OPENROUTER_APP_NAME || '', 100);
  return { baseUrl, apiKey, model, isOpenAIHosted, isOpenRouter, openRouterSiteUrl, openRouterAppName };
};

const normalizeMathExpression = (expression: string) => {
  let next = expression;

  // Handle fractions: (a)/(b) -> \frac{a}{b}
  next = next.replace(/\(\s*([^()]+?)\s*\)\s*\/\s*\(\s*([^()]+?)\s*\)/g, '\\frac{$1}{$2}');

  // Handle existing superscripts: x^2 -> x^{2}
  next = next.replace(/([A-Za-z0-9)\]])\^([A-Za-z0-9+\-]+)/g, '$1^{$2}');

  // Handle existing subscripts: x_2 -> x_{2}
  next = next.replace(/([A-Za-z0-9)\]])_([A-Za-z0-9+\-]+)/g, '$1_{$2}');

  // Handle implicit superscripts: x2, x3, etc. (when followed by letter or end)
  next = next.replace(/([A-Za-z])\s*(\d+)(?=\s*[A-Za-z]|$|\s*[\+\-\*\/\=\(\)\[\]\{\}\s]|$)/g, '$1^{$2}');

  // Handle coefficients with variables: 3x2 -> 3x^{2}, 2x^2 -> 2x^{2}
  next = next.replace(/(\d+)\s*([A-Za-z])\s*(\d+)/g, '$1$2^{$3}');

  // Handle square roots: sqrt(x) -> \sqrt{x}
  next = next.replace(/sqrt\s*\(\s*([^()]+?)\s*\)/g, '\\sqrt{$1}');

  // Handle pi and e constants
  next = next.replace(/\bpi\b/g, '\\pi');
  next = next.replace(/\be\b/g, '\\mathrm{e}');

  // imaginary and complex numbers
  next = next.replace(/\bi\b/g, '\\mathrm{i}');

  // Handle infinity
  next = next.replace(/\binf\b/g, '\\infty');

  return next;
};

const normalizeMathNotation = (text: string, subject: SupportedSubject | null) => {
  // Apply math normalization to subjects that commonly use mathematical notation
  const mathSubjects: SupportedSubject[] = ['mathematics', 'physics', 'chemistry', 'computer science'];
  if (!mathSubjects.includes(subject as SupportedSubject)) return text;

  let hasMathDelimiters = false;
  let next = text;

  next = next.replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression) => {
    hasMathDelimiters = true;
    return `\\(${normalizeMathExpression(expression)}\\)`;
  });

  next = next.replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression) => {
    hasMathDelimiters = true;
    return `\\[${normalizeMathExpression(expression)}\\]`;
  });

  next = next.replace(/\$\$([\s\S]*?)\$\$/g, (_match, expression) => {
    hasMathDelimiters = true;
    return `$$${normalizeMathExpression(expression)}$$`;
  });

  next = next.replace(/\$([^$\n]+)\$/g, (_match, expression) => {
    hasMathDelimiters = true;
    return `$${normalizeMathExpression(expression)}$`;
  });

  if (hasMathDelimiters) return next;
  return normalizeMathExpression(next);
};

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
    'When writing math, use explicit MathJax/LaTeX with grouping and brackets.',
    'Wrap math in $...$ and always bracket powers/subscripts: x^{2}, a_{n+1}, (ab)^{2}, x_{(i+1)}.',
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

  const commonHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    commonHeaders.Authorization = `Bearer ${config.apiKey}`;
  }
  if (config.isOpenRouter) {
    if (config.openRouterSiteUrl) commonHeaders['HTTP-Referer'] = config.openRouterSiteUrl;
    if (config.openRouterAppName) commonHeaders['X-Title'] = config.openRouterAppName;
  }

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

    if (!payload.name) {
      return NextResponse.json({ error: 'Deck name is required.' }, { status: 400 });
    }
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
    if (config.isOpenAIHosted && !config.apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY (or AI_API_KEY) is required.' }, { status: 500 });
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
    return NextResponse.json({ error: txt(message, MAX_TEXT) }, { status: 500 });
  }
}
