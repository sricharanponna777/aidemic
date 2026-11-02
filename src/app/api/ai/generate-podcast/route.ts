import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { buildAIHeaders, getAIConfig, getMissingHostedKeyError, getTTSConfig } from '@/lib/ai/config';
import { buildCourseSection, promptSection } from '@/lib/ai/courseContext';
import { getMajorTopicsForQualification, getQualificationTopicError } from '@/lib/ai/majorTopics';
import { AI_DAILY_LIMITS, checkAiRateLimit } from '@/lib/ai/rateLimit';
import { getTopicRelevanceError } from '@/lib/ai/topicRelevance';
import { txt } from '@/lib/ai/text';

type PodcastPayload = {
  subject: string;
  topic?: string;
  subtopic?: string;
  examBoard?: string;
  examType?: string;
  specification?: string;
};

type DialogueTurn = { speaker: 'HOST' | 'GUEST'; text: string };

const SPEAKER_PREFIX = /^(HOST|GUEST):\s*(.+)$/;
const PODCAST_MAX_ATTEMPTS = 2;

// ── GET: fetch saved podcast(s) ──────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const podcastId = searchParams.get('podcastId');

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (podcastId) {
      const { data: row, error } = await supabase
        .from('generated_podcasts')
        .select('*')
        .eq('id', podcastId)
        .single();

      if (error || !row) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      // `private`, not `public`: a shared/CDN cache keyed only on this URL would
      // serve one user's podcast to anyone who guesses the id. The row is only
      // ever inserted once its audio has finished generating, so it's always
      // safe to cache once found.
      return NextResponse.json({ podcast: row }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
    }

    const { data: rows, error } = await supabase
      .from('generated_podcasts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch podcasts' }, { status: 500 });
    }

    return NextResponse.json({ podcasts: rows ?? [] });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch podcasts' }, { status: 500 });
  }
}

// ── POST: generate ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body: PodcastPayload = await request.json();
    const { subject, topic, examBoard, examType, specification } = body;
    const subtopic = txt(body.subtopic || '', 200);

    if (!subject) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    }

    if (topic) {
      const allowedTopics = getMajorTopicsForQualification({ subject, examBoard, examType, specification });
      const topicError = getQualificationTopicError(topic, allowedTopics);
      if (topicError) {
        return NextResponse.json({ error: topicError }, { status: 400 });
      }
      const relevanceError = getTopicRelevanceError({ topic, subject, examBoard, examType, specification });
      if (relevanceError) {
        return NextResponse.json({ error: relevanceError }, { status: 400 });
      }
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { allowed } = await checkAiRateLimit(supabase, AI_DAILY_LIMITS.generatePodcast);
    if (!allowed) return NextResponse.json({ error: 'Daily AI usage limit reached. Try again tomorrow.' }, { status: 429 });

    const script = await generateScript(topic, subtopic, subject, examBoard, examType, specification);
    const turns = parseDialogueTurns(script);
    if (turns.length === 0) {
      return NextResponse.json({ error: 'The AI provider returned an empty script.' }, { status: 500 });
    }

    const ttsConfig = getTTSConfig();
    if (!ttsConfig.apiKey) {
      return NextResponse.json({ error: 'TTS_API_KEY (or AI_API_KEY) is required to synthesize podcast audio.' }, { status: 500 });
    }

    const voiceFor = (speaker: DialogueTurn['speaker']) => (speaker === 'HOST' ? ttsConfig.voice : ttsConfig.secondaryVoice);
    const turnAudio = await Promise.all(turns.map((turn) => synthesizeSpeech(turn.text, ttsConfig, voiceFor(turn.speaker))));
    const pcmBuffer = Buffer.concat(turnAudio);
    const audioBuffer = pcmToWav(pcmBuffer);
    const characterCount = turns.reduce((sum, turn) => sum + turn.text.length, 0);
    const length = characterCount < 1200 ? 'short' : characterCount < 2800 ? 'medium' : 'long';

    const filePath = `${user.id}/${crypto.randomUUID()}.wav`;
    const { error: uploadError } = await supabase.storage
      .from('generated-podcasts')
      .upload(filePath, audioBuffer, { contentType: 'audio/wav' });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to store generated audio' }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage.from('generated-podcasts').getPublicUrl(filePath);

    const { data, error } = await supabase
      .from('generated_podcasts')
      .insert({
        user_id: user.id,
        subject,
        topic: topic || 'General revision',
        subtopic: subtopic || null,
        length,
        voice: `${ttsConfig.voice} & ${ttsConfig.secondaryVoice}`,
        script_content: script,
        audio_url: publicUrl,
        character_count: characterCount,
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to save podcast' }, { status: 500 });
    }

    return NextResponse.json({ podcast: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    console.error('Podcast generation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function generateScript(
  topic: string | undefined,
  subtopic: string | undefined,
  subject: string,
  examBoard?: string,
  examType?: string,
  specification?: string,
): Promise<string> {
  const config = getAIConfig();
  const missingKeyError = getMissingHostedKeyError(config);
  if (missingKeyError) throw new Error(missingKeyError);

  const system = [
    'You write the script for a two-host educational audio podcast episode for the exact course described below. HOST leads the episode; GUEST is a co-host who asks questions, reacts, and adds detail. They have a natural, friendly back-and-forth conversation, like two people who know the subject well talking to each other. Everything they say must be accurate for this course.',
    promptSection('1. OUTPUT CONTRACT', [
      '- Return ONLY the labelled dialogue lines: no preamble, title, notes or blank commentary.',
      '- Every line starts with exactly "HOST:" or "GUEST:" followed by that turn\'s spoken words, and nothing else on the line.',
      '- At least 4 turns. HOST speaks first.',
    ]),
    buildCourseSection(
      {
        examBoard: examBoard !== 'general' ? examBoard : null,
        examType: examType !== 'general' ? examType : null,
        subject,
        specification,
        topic,
        subtopic: topic ? subtopic : null,
      },
      'generate'
    ),
    promptSection('3. CONTENT', [
      topic
        ? `- The episode is about "${topic}" in ${subject}.${subtopic ? ` Concentrate on the subtopic "${subtopic}" rather than the whole topic.` : ''}`
        : `- No topic was given: cover a well-rounded, representative spread of topics from this ${subject} specification.`,
      '- Use the terminology, definitions, equations and examples this specification uses, at the depth it requires at this tier.',
      '- Every fact, number and explanation must be correct. If either host is unsure of a detail, it is left out. Never invent statistics, case-study facts, quotations or exam-board claims. A host may voice a common misconception only if the other host immediately corrects it.',
      '- You decide the length. A narrow, simple topic might only need a tight ~1 minute (roughly 4-6 turns); a broad or rich topic can run to ~5 minutes (roughly 12-16 turns). Do not pad with filler or repetition, and do not rush past ideas that need room. Stop once the topic has been properly explained.',
      '- HOST opens with a short hook, then the two explain the ideas together conversationally -- asking each other questions, building on what the other just said, reacting naturally ("oh that\'s a good point", "wait, so how does that work?") -- and one of them closes with a brief recap.',
    ]),
    promptSection('4. SPOKEN-TEXT RULES', [
      '- Each turn is a short, natural chunk of speech (one to three sentences), not a monologue.',
      '- No markdown anywhere in the spoken text: no #, *, -, bullet lists or tables.',
      '- No LaTeX, mathematical symbols or special notation. Spell everything out as it is said aloud ("x squared plus two", not "x^2 + 2"; "the square root of nine", not "√9"; "metres per second", not "m/s").',
    ]),
    promptSection('5. VOICE DELIVERY TAGS', [
      'The script is read aloud by a Gemini text-to-speech voice that responds to inline delivery tags. Use them where they would occur naturally, so the read is expressive rather than flat.',
      '- Place a tag in square brackets immediately before the word or phrase it colours, e.g. "GUEST: [laughs] okay yes, that one always gets me." or "HOST: [whispers] here\'s the bit examiners love to test."',
      '- Draw from this set (or a close variant): [cheerful], [excited], [curious], [thoughtful], [amused], [laughs], [chuckles], [sighs], [surprised], [impressed], [reassuring], [serious], [emphatic], [encouraging], [explaining].',
      '- Use them sparingly and only where the emotion is genuine: roughly one tag every one or two turns, never more than one per turn. Tagging every line turns expression into noise.',
      '- Never write stage directions or sound effects outside this bracket-tag format (no "(pause)", no narrated actions).',
    ]),
    promptSection('6. FINAL VALIDATION', [
      'Before responding, silently check: every line starts with "HOST:" or "GUEST:"; every statement is correct and on this specification at this tier; no markdown, symbols or LaTeX remain. Fix anything that fails. Do not reveal this check.',
    ]),
  ]
    .filter(Boolean)
    .join('\n\n');

  // One retry for a script the parser would silently mangle: an unlabelled line
  // is dropped from the audio, and markup or notation is read aloud literally.
  // The final attempt is kept even if imperfect, as it always was.
  let script = '';
  for (let attempt = 0; attempt < PODCAST_MAX_ATTEMPTS; attempt++) {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: buildAIHeaders(config),
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: topic ? `Write the episode on "${topic}".` : `Write the ${subject} episode.` },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: { message?: string } }).error?.message ?? `AI provider error ${response.status}`);
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    script = data.choices[0].message.content.trim();
    if (getScriptProblem(script) === null) return script;
  }
  return script;
}

const MIN_TURNS = 4;
const UNSPEAKABLE = /[\\$^#*|`]/;

/** Why a script would not read aloud as written, or null when it is clean. */
function getScriptProblem(script: string): string | null {
  const lines = script.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.some((line) => !SPEAKER_PREFIX.test(line))) return 'unlabelled line';
  const turns = parseDialogueTurns(script);
  if (turns.length < MIN_TURNS) return 'too few turns';
  if (turns.some((turn) => UNSPEAKABLE.test(turn.text))) return 'markup or notation in spoken text';
  return null;
}

function parseDialogueTurns(script: string): DialogueTurn[] {
  return script
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(SPEAKER_PREFIX);
      if (!match) return null;
      const [, speaker, text] = match;
      return { speaker: speaker as DialogueTurn['speaker'], text: text.trim() };
    })
    .filter((turn): turn is DialogueTurn => !!turn && turn.text.length > 0);
}

async function synthesizeSpeech(text: string, ttsConfig: ReturnType<typeof getTTSConfig>, voice: string): Promise<Buffer> {
  const response = await fetch(`${ttsConfig.baseUrl}/audio/speech`, {
    method: 'POST',
    headers: buildAIHeaders(ttsConfig),
    body: JSON.stringify({
      model: ttsConfig.model,
      input: text,
      voice,
      response_format: 'pcm',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `TTS provider error ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Gemini TTS returns raw headerless PCM (16-bit signed, mono, 24kHz), which
// browsers can't play directly -- wrap it in a WAV header so <audio> can.
const PCM_SAMPLE_RATE = 24000;
const PCM_CHANNELS = 1;
const PCM_BIT_DEPTH = 16;

function pcmToWav(pcmData: Buffer): Buffer {
  const blockAlign = PCM_CHANNELS * (PCM_BIT_DEPTH / 8);
  const byteRate = PCM_SAMPLE_RATE * blockAlign;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(PCM_CHANNELS, 22);
  header.writeUInt32LE(PCM_SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(PCM_BIT_DEPTH, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
}
