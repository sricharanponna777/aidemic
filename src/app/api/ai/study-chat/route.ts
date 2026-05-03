import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

type ChatRole = 'user' | 'assistant';

type StudyChatMessage = {
  role?: ChatRole;
  content?: string;
};

type StudyChatPayload = {
  concept?: string;
  subject?: string;
  examBoard?: string;
  examType?: string;
  mode?: 'notes' | 'slideshow';
  messages?: StudyChatMessage[];
};

type ChatCompletionsResponseBody = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

const txt = (value: string, length: number) =>
  value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, length);

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

const buildHeaders = (config: ReturnType<typeof getAIConfig>) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  if (config.isOpenRouter) {
    if (config.openRouterSiteUrl) headers['HTTP-Referer'] = config.openRouterSiteUrl;
    if (config.openRouterAppName) headers['X-Title'] = config.openRouterAppName;
  }
  return headers;
};

const normalizeMessages = (messages: StudyChatMessage[] = []) =>
  messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role as ChatRole,
      content: txt(message.content || '', 1400),
    }))
    .filter((message) => message.content)
    .slice(-10);

const extractMessageText = (body: ChatCompletionsResponseBody) => {
  const content = body.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => (part.type === 'text' ? part.text || '' : '')).join('\n').trim();
  }
  return '';
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = (await request.json()) as StudyChatPayload;
    const payload = {
      concept: txt(rawBody.concept || '', 200),
      subject: txt(rawBody.subject || 'General', 80),
      examBoard: txt(rawBody.examBoard || 'general', 40),
      examType: txt(rawBody.examType || 'general', 40),
      mode: rawBody.mode === 'slideshow' ? 'slideshow' : 'notes',
      messages: normalizeMessages(rawBody.messages),
    };

    const latestUserMessage = [...payload.messages].reverse().find((message) => message.role === 'user');
    if (!payload.concept) return NextResponse.json({ error: 'Topic is required.' }, { status: 400 });
    if (!latestUserMessage) return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 });

    const config = getAIConfig();
    if (config.isOpenAIHosted && !config.apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY (or AI_API_KEY) is required for OpenAI hosted API.' }, { status: 500 });
    }

    const system = [
      'You are AIDemic Study Chat, a patient AI tutor.',
      'Help the student understand the current topic using concise explanations, examples, and gentle checks for understanding.',
      'Prefer clarity over length. Keep replies under 180 words unless the student asks for detail.',
      'If the student seems confused, explain from first principles and then give one quick practice check.',
      'Format every answer in clean GitHub-flavored Markdown. Use short headings only when helpful, bullet lists for steps or key points, **bold** for key terms, and `code` for literal terms. Do not use raw HTML.',
      'For math or science notation, use $...$ or \\(...\\) for inline math, and $$...$$ or \\[...\\] for display math. Keep powers/subscripts bracketed.',
      `Topic: ${payload.concept}`,
      `Subject: ${payload.subject}`,
      payload.examBoard !== 'general' ? `Exam board: ${payload.examBoard.toUpperCase()}` : '',
      payload.examType !== 'general' ? `Level: ${payload.examType}` : '',
      `Current study mode: ${payload.mode === 'notes' ? 'study notes' : 'slideshow'}`,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        model: config.model,
        temperature: 0.35,
        messages: [
          { role: 'system', content: system },
          ...payload.messages,
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: txt(errorText || 'AI chat failed.', 1400) }, { status: 502 });
    }

    const body = (await response.json()) as ChatCompletionsResponseBody;
    const reply = txt(extractMessageText(body), 2400);
    if (!reply) return NextResponse.json({ error: 'AI chat returned an empty reply.' }, { status: 502 });

    return NextResponse.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Study chat failed.';
    return NextResponse.json({ error: txt(message, 1400) }, { status: 500 });
  }
}
