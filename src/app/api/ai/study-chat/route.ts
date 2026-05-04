import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { buildAIHeaders, getAIConfig, getMissingHostedKeyError } from '@/lib/ai/config';
import { extractChatMessageText, type ChatCompletionsResponseBody } from '@/lib/ai/json';
import { cleanText } from '@/lib/ai/text';

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

const txt = (value: string, length: number) =>
  cleanText(value, length);

const normalizeMessages = (messages: StudyChatMessage[] = []) =>
  messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role as ChatRole,
      content: txt(message.content || '', 1400),
    }))
    .filter((message) => message.content)
    .slice(-10);

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
    const missingKeyError = getMissingHostedKeyError(config);
    if (missingKeyError) {
      return NextResponse.json({ error: missingKeyError }, { status: 500 });
    }

    const system = [
      'You are AIDemic Study Chat, a patient AI tutor.',
      'Help the student understand the current topic using concise explanations, examples, and gentle checks for understanding.',
      'Prefer clarity over length. Keep replies under 180 words unless the student asks for detail.',
      'If the student seems confused, explain from first principles and then give one quick practice check.',
      'Format every answer in clean GitHub-flavored Markdown. Use short headings only when helpful, bullet lists for steps or key points, **bold** for key terms, and `code` for literal terms. Do not use raw HTML.',
      'For math or science notation, use \\(...\\) for inline math and \\[...\\] for display math. Do not leave bare LaTeX in prose. Keep powers/subscripts bracketed, for example \\(\\binom{7}{4}a^{3}b^{4}\\).',
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
      headers: buildAIHeaders(config),
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
    const reply = txt(extractChatMessageText(body), 2400);
    if (!reply) return NextResponse.json({ error: 'AI chat returned an empty reply.' }, { status: 502 });

    return NextResponse.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Study chat failed.';
    return NextResponse.json({ error: txt(message, 1400) }, { status: 500 });
  }
}
