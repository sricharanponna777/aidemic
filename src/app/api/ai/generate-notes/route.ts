// Generates Markdown study notes (+ recall checkpoints). Persists to the
// `generated_videos` table, whose name is legacy — this feature produces notes,
// not video. The table/bucket names are kept to avoid a heavy schema migration.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { buildAIHeaders, getAIConfig, getMissingHostedKeyError } from '@/lib/ai/config';
import { buildCourseSection, promptSection } from '@/lib/ai/courseContext';
import { getMajorTopicsForQualification, getQualificationTopicError } from '@/lib/ai/majorTopics';
import { AI_DAILY_LIMITS, checkAiRateLimit } from '@/lib/ai/rateLimit';
import { getTopicRelevanceError } from '@/lib/ai/topicRelevance';
import { isDataAnalysisObjective } from '@/lib/ai/text';
import { LATEX_COMMAND_PATTERN, normalizeLatexControlCharacters } from '@/lib/mathText';

type NotesPayload = {
  flashcardId?: string;
  concept: string;
  subtopic?: string;
  learningObjective?: string;
  paper?: string;
  subject: string;
  duration?: '30' | '60' | '120';
  examBoard?: string;
  examType?: string;
  specification?: string;
  mode?: 'notes';
};

const SLIDES_PER_DURATION: Record<string, number> = { '30': 5, '60': 10, '120': 20 };
const MATRIX_ENVIRONMENT = '((?:p|b|B|v|V)?matrix)';
const NOTES_MAX_ATTEMPTS = 2;

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

    // `private`, not `public`: a shared/CDN cache keyed only on this URL would
    // serve one user's notes to anyone who guesses the id. Only cache once
    // generation has actually finished — content is immutable after that.
    const headers = row.status === 'completed' ? { 'Cache-Control': 'private, max-age=3600' } : undefined;

    return NextResponse.json(
      {
        videoId: row.id,
        status: row.status,
        slides: normalizeGeneratedSlides(row.video_url ? JSON.parse(row.video_url) : []),
        script: normalizeGeneratedText(row.script_content || ''),
      },
      headers ? { headers } : undefined
    );
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
  }
}

// ── POST: generate ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body: NotesPayload = await request.json();
    const { concept, subtopic, learningObjective, paper, subject, duration = '120', flashcardId, examBoard, examType, specification, mode = 'notes' } = body;

    if (mode !== 'notes') {
      return NextResponse.json({ error: 'Only study notes generation is supported.' }, { status: 400 });
    }

    if (!subject) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    }
    if (concept) {
      const allowedTopics = getMajorTopicsForQualification({ subject, examBoard, examType, specification });
      const topicError = getQualificationTopicError(concept, allowedTopics);
      if (topicError) {
        return NextResponse.json({ error: topicError }, { status: 400 });
      }
      const relevanceError = getTopicRelevanceError({
        topic: concept,
        subject,
        examBoard,
        examType,
        specification,
      });
      if (relevanceError) {
        return NextResponse.json({ error: relevanceError }, { status: 400 });
      }
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Every field below shapes the generation prompt, so an exact match here
    // means the AI would produce equivalent notes -- reuse them instead of
    // spending a generation call (and the student's daily AI quota) on
    // content that already exists. Checked before the rate limit for the same
    // reason: reopening old notes shouldn't count against it.
    const matchParams = {
      concept: concept || 'General revision',
      subject,
      duration: parseInt(duration, 10),
      exam_board: examBoard || '',
      exam_type: examType || '',
      specification: specification || '',
      subtopic: subtopic || '',
      learning_objective: learningObjective || '',
      paper: paper || '',
    };

    const { data: existing } = await supabase
      .from('generated_videos')
      .select('id, video_url, script_content')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .match(matchParams)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        videoId: existing.id,
        status: 'completed',
        slides: normalizeGeneratedSlides(existing.video_url ? JSON.parse(existing.video_url) : []),
        script: normalizeGeneratedText(existing.script_content || ''),
      });
    }

    const { allowed } = await checkAiRateLimit(supabase, AI_DAILY_LIMITS.generateVideo);
    if (!allowed) return NextResponse.json({ error: 'Daily AI usage limit reached. Try again tomorrow.' }, { status: 429 });

    const { script, slides } = await generateNotes(concept, subtopic, learningObjective, paper, subject, duration, examBoard, examType, specification);

    const { data, error } = await supabase
      .from('generated_videos')
      .insert({
        user_id: user.id,
        flashcard_id: flashcardId ?? null,
        style: 'study-notes',
        service_used: 'ai-compatible',
        status: 'completed',
        video_url: JSON.stringify(slides),
        script_content: script,
        completed_at: new Date().toISOString(),
        ...matchParams,
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

async function generateNotes(
  concept: string,
  subtopic: string | undefined,
  learningObjective: string | undefined,
  paper: string | undefined,
  subject: string,
  duration: string,
  examBoard?: string,
  examType?: string,
  specification?: string,
): Promise<{ script: string; slides: string[] }> {
  const config = getAIConfig();
  const missingKeyError = getMissingHostedKeyError(config);
  if (missingKeyError) throw new Error(missingKeyError);

  const seconds = parseInt(duration, 10);
  const slideCount = SLIDES_PER_DURATION[duration] ?? 5;
  const complexity = seconds <= 30 ? 'simple' : seconds <= 60 ? 'moderate' : 'detailed';

  const system = [
    'You are an expert teacher and examiner for the exact course described below. You write accurate, specification-aligned revision notes that a student can learn from and trust completely.',
    promptSection('1. OUTPUT CONTRACT', [
      'Return ONLY one JSON object with exactly this shape, and no text outside it:',
      '{',
      '  "script": "<GitHub-flavoured Markdown study notes>",',
      `  "slides": [${Array.from({ length: slideCount }, (_, i) => `"<checkpoint ${i + 1}>"`).join(', ')}]`,
      '}',
      `- "slides" contains exactly ${slideCount} non-empty strings. Each is one key idea or recall prompt from the notes.`,
      '- "script" is never empty.',
      '- Markdown only inside JSON string values. Never use raw HTML.',
      '- The output must parse with JSON.parse().',
    ]),
    buildCourseSection(
      {
        examBoard: examBoard !== 'general' ? examBoard : null,
        examType: examType !== 'general' ? examType : null,
        subject,
        specification,
        topic: concept,
        subtopic,
        learningObjective,
        paper,
      },
      'generate'
    ),
    promptSection('3. CONTENT OF THE NOTES', [
      concept
        ? `- Topic: "${concept}". Before writing, confirm it belongs to this specification at this tier, then cover what the specification requires on it.`
        : `- No topic was given: cover a well-rounded, representative spread across ${paper ? `the topics assessed on ${paper}` : 'the whole specification'}.`,
      subtopic ? `- Concentrate the notes on the subtopic "${subtopic}" rather than the whole topic.` : '',
      learningObjective ? `- Make sure the notes fully meet the learning objective: ${learningObjective}` : '',
      learningObjective && isDataAnalysisObjective(learningObjective)
        ? '- This is a data-analysis session: include at least one worked example presented as a markdown table (| col | col |) of realistic data, showing how to read, calculate from, or interpret it.'
        : '',
      `- Depth: ${complexity}. Target reading time about ${seconds} seconds.`,
      '- Use the definitions, terminology, equations, units, required practicals, case studies and set texts this specification uses, at the depth it requires at this tier.',
      '- Every fact, definition, equation and worked example must be correct. Re-check every calculation. If you are unsure of a detail, leave it out rather than guess.',
      '- Never invent statistics, case-study facts, quotations or exam-board claims.',
      '- Write notes a student revises from, not narration: ## headings, concise explanations, bullet lists, worked examples where useful, **bold** key terms, and a final **Mini-summary** section.',
      '- Present any data set as a markdown table (| col | col |).',
    ]),
    promptSection('4. MATHEMATICS AND LATEX', [
      '- Wrap every math expression for rendering: \\\\(...\\\\) for inline math, \\\\[...\\\\] for display math. Never leave bare LaTeX in prose.',
      '- Because the response is JSON, escape every LaTeX backslash as a double backslash, for example "\\\\(\\\\binom{7}{4}a^{3}b^{4}\\\\)", "\\\\(\\\\frac{1}{2}\\\\)", "\\\\(\\\\text{det}(A)\\\\)" and "\\\\[A = \\\\begin{pmatrix} a & b \\\\\\\\ c & d \\\\end{pmatrix}\\\\]".',
      '- Always brace powers and subscripts: x^{2}, a_{n+1}.',
      '- For matrices, use one clean display equation. Never add blank rows or trailing row separators inside a matrix. Write inverses as A^{-1} inside math, never A-1.',
    ]),
    promptSection('5. FINAL VALIDATION', [
      `Before responding, silently check: every statement is correct and on this specification at this tier; every calculation is right; "slides" has exactly ${slideCount} non-empty items; every math expression is delimited and escaped; the JSON is valid. Fix anything that fails. Do not reveal this check.`,
    ]),
  ]
    .filter(Boolean)
    .join('\n\n');

  const user = concept
    ? `Write the study notes on "${concept}" for ${subject}.`
    : `Write general study notes for ${subject}.`;

  // An empty script or a short checkpoint list is retried rather than saved:
  // the row is cached by its inputs (see matchParams), so a bad result would be
  // served back on every reopen.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < NOTES_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: buildAIHeaders(config),
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: { message?: string } }).error?.message ?? `AI provider error ${response.status}`);
      }

      const data = await response.json() as { choices: { message: { content: string } }[] };
      const rawContent = data.choices[0].message.content;
      const parsed = parseGeneratedContent(rawContent) as {
        script: string;
        slides: string[];
      };

      const script = normalizeGeneratedText(parsed.script);
      const slides = normalizeGeneratedSlides(parsed.slides).slice(0, slideCount);
      if (!script) throw new Error('The AI returned empty notes.');
      if (slides.length < slideCount) throw new Error(`The AI returned ${slides.length} of ${slideCount} checkpoints.`);
      return { script, slides };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Generation failed');
}

function parseGeneratedContent(content: string) {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const escapedLatex = escapeInvalidJsonBackslashes(escapeLooseLatexBackslashes(content));
    return JSON.parse(escapedLatex) as unknown;
  }
}

function escapeLooseLatexBackslashes(content: string) {
  const pattern = new RegExp(`(^|[^\\\\])\\\\(?=${LATEX_COMMAND_PATTERN}\\b)`, 'g');
  return content.replace(pattern, (_match, prefix: string) => `${prefix}\\\\`);
}

function escapeInvalidJsonBackslashes(content: string): string {
  let result = '';
  let i = 0;
  while (i < content.length) {
    if (content[i] !== '\\') {
      result += content[i++];
      continue;
    }
    const next = content[i + 1] ?? '';
    if (next === '"' || next === '\\' || next === '/' ||
        next === 'b' || next === 'f' || next === 'n' ||
        next === 'r' || next === 't') {
      // Valid 2-char JSON escape — copy both and advance past them
      result += content[i] + next;
      i += 2;
    } else if (next === 'u' && /^[0-9a-fA-F]{4}/.test(content.slice(i + 2, i + 6))) {
      // Valid unicode escape \uXXXX — copy all 6 chars
      result += content.slice(i, i + 6);
      i += 6;
    } else {
      // Invalid escape — double the backslash, don't consume the next char
      result += '\\\\';
      i++;
    }
  }
  return result;
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
