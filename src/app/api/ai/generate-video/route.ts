import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { buildAIHeaders, getAIConfig, getMissingHostedKeyError } from '@/lib/ai/config';
import { LATEX_COMMAND_PATTERN, normalizeLatexControlCharacters } from '@/lib/mathText';

type SlideshowPayload = {
  flashcardId?: string;
  concept: string;
  subject: string;
  duration?: '30' | '60' | '120';
  examBoard?: string;
  examType?: string;
  mode?: 'notes' | 'slideshow';
};

const SLIDES_PER_DURATION: Record<string, number> = { '30': 5, '60': 10, '120': 20 };
const MATRIX_ENVIRONMENT = '((?:p|b|B|v|V)?matrix)';

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
      slides: normalizeGeneratedSlides(row.video_url ? JSON.parse(row.video_url) : []),
      script: normalizeGeneratedText(row.script_content || ''),
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
    const { concept, subject, duration = '60', flashcardId, examBoard, examType, mode = 'slideshow' } = body;

    if (!concept || !subject) {
      return NextResponse.json({ error: 'Concept and subject are required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { script, slides } = await generateSlides(concept, subject, duration, examBoard, examType, mode);

    const { data, error } = await supabase
      .from('generated_videos')
      .insert({
        user_id: user.id,
        flashcard_id: flashcardId ?? null,
        concept,
        subject,
        style: mode === 'notes' ? 'study-notes' : 'text-slides',
        duration: parseInt(duration, 10),
        service_used: 'ai-compatible',
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
  mode: 'notes' | 'slideshow' = 'slideshow',
): Promise<{ script: string; slides: string[] }> {
  const config = getAIConfig();
  const missingKeyError = getMissingHostedKeyError(config);
  if (missingKeyError) throw new Error(missingKeyError);

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

  const instruction =
    mode === 'notes'
      ? `Create study notes about "${concept}" in ${subject}.
Depth: ${complexity}. Target reading time: ~${seconds} seconds total.${examContext ? `\n${examContext} Tailor the depth, terminology, and examples to match what students at this level need for this exam board.` : ''}

Return ONLY valid JSON with this exact shape:
{
  "script": "<GitHub-flavored Markdown study notes with ## headings, concise explanations, bullet lists, worked examples where useful, **bold** key terms, and a final **Mini-summary** section>",
  "slides": [${Array.from({ length: slideCount }, (_, i) => `\n    "<checkpoint ${i + 1}: one key idea or recall prompt>"`).join(',')}
  ]
}

Write the script as notes a student can revise from, not narration. Keep it accurate, direct, and easy to scan.
Use Markdown only inside JSON string values. Do not use raw HTML.
Every math expression must be wrapped for rendering: use \\\\(...\\\\) for inline math and \\\\[...\\\\] for display math. Do not leave bare LaTeX in prose.
Because the response is JSON, every LaTeX backslash must be escaped as a double backslash, for example \\\\(\\\\binom{7}{4}a^{3}b^{4}\\\\), \\\\(\\\\frac{1}{2}\\\\), \\\\(\\\\text{det}(A)\\\\), and \\\\[A = \\\\begin{pmatrix} a & b \\\\\\\\ c & d \\\\end{pmatrix}\\\\].
For matrices, use one clean display equation such as \\\\[ A = \\\\begin{pmatrix} a & b \\\\\\\\ c & d \\\\end{pmatrix} \\\\].
Never add blank rows or trailing row separators inside a matrix. Write inverses as $A^{-1}$, not A-1.
Do NOT include any text outside the JSON.`
      : `Create a ${slideCount}-slide educational slideshow about "${concept}" in ${subject}.
Complexity: ${complexity}. Target reading time: ~${seconds} seconds total.${examContext ? `\n${examContext} Tailor the depth, terminology, and examples to match what students at this level need for this exam board.` : ''}

Return ONLY valid JSON with this exact shape:
{
  "script": "<GitHub-flavored Markdown narration notes, conversational and vivid, ~${seconds} seconds when read aloud>",
  "slides": [${Array.from({ length: slideCount }, (_, i) => `\n    "<slide ${i + 1} text: 2-3 sentences>"`).join(',')}
  ]
}

Structure the slides to flow logically: open with a hook, build through the core concept and key details, apply it concretely, then close with a summary.
Each slide is a short standalone paragraph a student reads on screen. Slides may use **bold** for key terms and \\\\(...\\\\) for inline math, but avoid large headings inside slides.
Use Markdown only inside JSON string values. Do not use raw HTML.
Every math expression must be wrapped for rendering: use \\\\(...\\\\) for inline math and \\\\[...\\\\] for display math. Do not leave bare LaTeX in prose.
Because the response is JSON, every LaTeX backslash must be escaped as a double backslash, for example \\\\(\\\\binom{7}{4}a^{3}b^{4}\\\\), \\\\(\\\\frac{1}{2}\\\\), \\\\(\\\\text{det}(A)\\\\), and \\\\[A = \\\\begin{pmatrix} a & b \\\\\\\\ c & d \\\\end{pmatrix}\\\\].
Never add blank rows or trailing row separators inside a matrix. Write inverses as $A^{-1}$, not A-1.
Do NOT include any text outside the JSON.`;

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildAIHeaders(config),
    body: JSON.stringify({
      model: config.model,
      messages: [{
        role: 'user',
        content: instruction,
      }],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `AI provider error ${response.status}`);
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  const parsed = parseGeneratedContent(data.choices[0].message.content) as {
    script: string;
    slides: string[];
  };

  return {
    script: normalizeGeneratedText(parsed.script),
    slides: normalizeGeneratedSlides(parsed.slides).slice(0, slideCount),
  };
}

function parseGeneratedContent(content: string) {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const escapedLatex = escapeLooseLatexBackslashes(content);
    return JSON.parse(escapedLatex) as unknown;
  }
}

function escapeLooseLatexBackslashes(content: string) {
  const pattern = new RegExp(`(^|[^\\\\])\\\\(?=${LATEX_COMMAND_PATTERN}\\b)`, 'g');
  return content.replace(pattern, (_match, prefix: string) => `${prefix}\\\\`);
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, '').trim();
}

function normalizeGeneratedText(value: string) {
  let next = normalizeLatexControlCharacters(String(value || ''))
    .replace(/([A-Za-z0-9)\]])\s*<sub>([\s\S]*?)<\/sub>/gi, (_match, base: string, sub: string) => {
      const cleanSub = stripTags(sub);
      return cleanSub ? `$${base}_{${cleanSub}}$` : base;
    })
    .replace(/([A-Za-z0-9)\]])\s*<sup>([\s\S]*?)<\/sup>/gi, (_match, base: string, sup: string) => {
      const cleanSup = stripTags(sup);
      return cleanSup ? `$${base}^{${cleanSup}}$` : base;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]{3,}/g, '  ')
    .trim();

  next = normalizeLatexMatrices(next);
  next = normalizeDelimitedMathSegments(next);
  next = wrapBareMatrixFormulaLines(next);
  next = normalizeTextInverseNotation(next);
  return next;
}

function normalizeGeneratedSlides(slides: unknown): string[] {
  if (!Array.isArray(slides)) return [];
  return slides.map((slide) => normalizeGeneratedText(String(slide || ''))).filter(Boolean);
}

function normalizeMathInverseNotation(value: string) {
  return value
    .replace(/\b([A-Z])-1\b/g, '$1^{-1}')
    .replace(/\b([A-Z])\^-1\b/g, '$1^{-1}');
}

function normalizeLatexMathSegment(value: string) {
  return normalizeMathInverseNotation(value).replace(/\\text\{det\}/g, '\\det');
}

function normalizeDelimitedMathSegments(value: string) {
  return value
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match, body: string) => `$$${normalizeLatexMathSegment(body)}$$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, body: string) => `\\[${normalizeLatexMathSegment(body)}\\]`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, body: string) => `\\(${normalizeLatexMathSegment(body)}\\)`)
    .replace(/(?<!\$)\$([^$\n]+)\$(?!\$)/g, (_match, body: string) => `$${normalizeLatexMathSegment(body)}$`);
}

function normalizeTextInverseNotation(value: string) {
  return value
    .split('\n')
    .map((line) => {
      if (/(?:\\\[|\\\(|\$\$|\$|\\begin\{)/.test(line)) return line;
      return line
        .replace(/\b([A-Z])-1\b/g, '$$$1^{-1}$')
        .replace(/\b([A-Z])\^-1\b/g, '$$$1^{-1}$');
    })
    .join('\n');
}

function normalizeLatexMatrices(value: string) {
  const matrixRegex = new RegExp(`\\\\begin\\{${MATRIX_ENVIRONMENT}\\}([\\s\\S]*?)\\\\end\\{\\1\\}`, 'g');

  return value.replace(matrixRegex, (_match, environment: string, body: string) => {
    const cleanedBody = body
      .replace(/\\\s*$/g, '')
      .replace(/(?:\s*\\\\\s*)+$/g, '')
      .replace(/\\\\\s*(?:\\\\\s*)+/g, '\\\\ ')
      .replace(/\s+/g, ' ')
      .trim();

    return `\\begin{${environment}} ${cleanedBody} \\end{${environment}}`;
  });
}

function wrapBareMatrixFormulaLines(value: string) {
  const containsMatrix = new RegExp(`\\\\begin\\{${MATRIX_ENVIRONMENT}\\}`);

  return value
    .split('\n')
    .flatMap((line) => {
      if (!containsMatrix.test(line) || /^\s*(?:\\\[|\$\$|\$|\\\()/.test(line)) return [line];

      const indent = line.match(/^\s*/)?.[0] ?? '';
      const trimmed = line.trim();
      const ifMatch = trimmed.match(/^If\s+(.+)$/i);
      const expression = normalizeMathInverseNotation(ifMatch ? ifMatch[1] : trimmed);

      if (!/[=&]|\\frac|\\det|\\text\{det\}/.test(expression)) return [line];

      const displayLine = `${indent}\\[ ${expression.replace(/\\text\{det\}/g, '\\det')} \\]`;
      return ifMatch ? [`${indent}If`, displayLine] : [displayLine];
    })
    .join('\n');
}
