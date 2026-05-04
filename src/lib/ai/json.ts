export type OpenAIResponseBody = {
  output_text?: string;
  output?: Array<{ content?: Array<{ json?: unknown; text?: string; type?: string }> }>;
};

export type ChatCompletionsResponseBody = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      parsed?: unknown;
    };
  }>;
};

type Coercer<T> = (value: unknown) => T | null;

export const extractFirstJsonObject = (text: string) => {
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
      if (depth === 0 && start >= 0) return text.slice(start, i + 1);
    }
  }

  return '';
};

export const extractJsonWithCoercer = <T>(rawText: string, coerce: Coercer<T>): T | null => {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  try {
    return coerce(JSON.parse(trimmed) as unknown);
  } catch {
    const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i) || trimmed.match(/```\s*([\s\S]*?)\s*```/i);
    if (fenceMatch?.[1]) {
      try {
        const coerced = coerce(JSON.parse(fenceMatch[1]) as unknown);
        if (coerced) return coerced;
      } catch {
        // Continue to object extraction below.
      }
    }

    const candidate = extractFirstJsonObject(trimmed);
    if (!candidate) return null;

    try {
      return coerce(JSON.parse(candidate) as unknown);
    } catch {
      return null;
    }
  }
};

export const tryExtractWithCoercer = <T>(value: unknown, coerce: Coercer<T>, extractText: (text: string) => T | null) => {
  const coerced = coerce(value);
  if (coerced) return coerced;
  return typeof value === 'string' ? extractText(value) : null;
};

export const extractFromResponsesBody = <T>(
  body: OpenAIResponseBody,
  coerce: Coercer<T>,
  extractText: (text: string) => T | null,
) => {
  const direct = extractText(typeof body.output_text === 'string' ? body.output_text : '');
  if (direct) return direct;
  if (!Array.isArray(body.output)) return null;

  for (const item of body.output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const entry of content) {
      const fromJson = tryExtractWithCoercer(entry.json, coerce, extractText);
      if (fromJson) return fromJson;
      const fromText = extractText(entry.text || '');
      if (fromText) return fromText;
    }
  }

  return null;
};

export const extractChatMessageText = (body: ChatCompletionsResponseBody) => {
  const content = body.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => (part.type === 'text' ? part.text || '' : '')).join('\n').trim();
  }
  return '';
};
