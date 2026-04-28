import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

type SlideshowPayload = {
  flashcardId?: string;
  concept: string;
  subject: string;
  duration?: '30' | '60' | '120';
  examBoard?: string;
  examType?: string;
};

const SLIDES_PER_DURATION: Record<string, number> = { '30': 5, '60': 10, '120': 20 };

// ── GET: fetch saved content ─────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');
    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from('generated_videos')
      .select('*')
      .eq('id', videoId)
      .single();

    if (error || !row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      videoId: row.id,
      status: row.status,
      slides: row.video_url ? JSON.parse(row.video_url) : [],
      script: row.script_content,
    });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
  }
}

// ── POST: generate ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body: SlideshowPayload = await request.json();
    const { concept, subject, duration = '60', flashcardId, examBoard, examType } = body;

    if (!concept || !subject) {
      return NextResponse.json({ error: 'Concept and subject are required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { script, slides } = await generateSlides(concept, subject, duration, examBoard, examType);

    const { data, error } = await supabase
      .from('generated_videos')
      .insert({
        user_id: user.id,
        flashcard_id: flashcardId ?? null,
        concept,
        subject,
        style: 'text-slides',
        duration: parseInt(duration, 10),
        service_used: 'openrouter',
        status: 'completed',
        video_url: JSON.stringify(slides),
        script_content: script,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to save content' }, { status: 500 });
    }

    return NextResponse.json({
      videoId: data.id,
      status: 'completed',
      slides,
      script,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    console.error('Generation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function generateSlides(
  concept: string,
  subject: string,
  duration: string,
  examBoard?: string,
  examType?: string,
): Promise<{ script: string; slides: string[] }> {
  if (!process.env.AI_API_KEY) throw new Error('AI_API_KEY is not configured');

  const seconds = parseInt(duration, 10);
  const slideCount = SLIDES_PER_DURATION[duration] ?? 5;
  const complexity = seconds <= 30 ? 'simple' : seconds <= 60 ? 'moderate' : 'detailed';

  const boardContext = examBoard && examBoard !== 'general'
    ? `Exam board: ${examBoard.toUpperCase()}.`
    : '';
  const levelContext = examType && examType !== 'general'
    ? `Level: ${examType}.`
    : '';
  const examContext = [boardContext, levelContext].filter(Boolean).join(' ');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.AI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Create a ${slideCount}-slide educational slideshow about "${concept}" in ${subject}.
Complexity: ${complexity}. Target reading time: ~${seconds} seconds total.${examContext ? `\n${examContext} Tailor the depth, terminology, and examples to match what students at this level need for this exam board.` : ''}

Return ONLY valid JSON with this exact shape:
{
  "script": "<full narration script, conversational and vivid, ~${seconds} seconds when read aloud>",
  "slides": [${Array.from({ length: slideCount }, (_, i) => `\n    "<slide ${i + 1} text: 2-3 sentences>"`).join(',')}
  ]
}

Structure the slides to flow logically: open with a hook, build through the core concept and key details, apply it concretely, then close with a summary.
Each slide is a short standalone paragraph a student reads on screen. Write clearly and engagingly.
Do NOT include any text outside the JSON.`,
      }],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `OpenRouter error ${response.status}`);
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  const parsed = JSON.parse(data.choices[0].message.content) as {
    script: string;
    slides: string[];
  };

  return {
    script: parsed.script,
    slides: parsed.slides.slice(0, slideCount),
  };
}
