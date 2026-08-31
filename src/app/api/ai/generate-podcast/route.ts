import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { buildAIHeaders, getAIConfig, getMissingHostedKeyError, getTTSConfig } from '@/lib/ai/config';
import { getExamTypeLabel } from '@/lib/ai/qualifications';
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

  const boardContext = examBoard && examBoard !== 'general' ? `Exam board: ${examBoard.toUpperCase()}.` : '';
  const levelContext = examType && examType !== 'general' ? `Qualification: ${getExamTypeLabel(examType)}.` : '';
  const examContext = [boardContext, levelContext].filter(Boolean).join(' ');
  const specContext = specification ? `Specification: ${specification}.` : '';
  const courseContext = [examContext, specContext].filter(Boolean).join(' ');

  const instruction = `You are writing the script for a two-host educational audio podcast episode. HOST leads the episode; GUEST is a co-host who asks questions, reacts, and adds detail. They have a natural, friendly back-and-forth conversation, like two people who know the subject well talking to each other.

${topic
    ? `The episode is about "${topic}" in ${subject}.`
    : `No specific topic was given, so generalise across ${subject}, choosing a well-rounded, representative spread of topics from the specification.`}
${topic && subtopic ? `Subtopic focus: ${subtopic}. Concentrate the episode on this subtopic rather than the whole topic.\n` : ''}${courseContext ? `${courseContext}\n` : ''}You decide the length. Cover the topic properly -- a narrow, simple topic might only need a tight ~1 minute (roughly 4-6 turns), while a broad or genuinely rich topic can run to ~5 minutes (roughly 12-16 turns). Do not pad with filler or repetition to hit a length, and do not rush past ideas that need room -- stop once the topic has been properly explained.

HOST opens with a short hook, then the two of them explain the ideas together conversationally -- asking each other questions, building on what the other just said, reacting naturally ("oh that's a good point", "wait, so how does that work?") -- and GUEST or HOST closes with a brief recap.

Formatting requirements:
- Every line must start with exactly "HOST:" or "GUEST:" followed by that turn's spoken words, and nothing else on the line.
- Each turn should be a short, natural chunk of speech (one to three sentences), not a long monologue.
- Do not use markdown formatting (no #, *, -, bullet lists, or tables) anywhere in the spoken text.
- Do not use LaTeX, mathematical symbols, or special notation. Spell everything out the way you would say it aloud (e.g. "x squared plus two" not "x^2 + 2", "the square root of nine" not "√9").
- Only include content that is assessable for the stated course/specification. Do not import topics from another exam board, qualification level, or option route.

Voice delivery tags:
This script will be read aloud by a Gemini text-to-speech voice that responds to inline delivery tags. Sprinkle these in where they'd occur naturally in real conversation, to make the read expressive rather than flat.
- Place a tag in square brackets immediately before the word or phrase it colours, e.g. "GUEST: [laughs] okay yes, that one always gets me." or "HOST: [whispers] here's the bit examiners love to test."
- Draw from this set (or a close variant of it) and use whichever fits the moment: [cheerful], [excited], [curious], [thoughtful], [amused], [laughs], [chuckles], [sighs], [surprised], [impressed], [reassuring], [serious], [emphatic], [encouraging], [explaining].
- Use them sparingly and only where the emotion is genuine -- roughly one tag every one or two turns, never more than one per turn, and never on a turn that doesn't call for it. Do not tag every line or the effect becomes noise instead of expression.
- Never invent stage directions or sound effects outside this bracket-tag format (no "(pause)", no narrated actions) -- only the speaker label, optional single leading tag, and their spoken words.

Return ONLY the labelled dialogue lines. Do not include any preamble, title, or text outside the dialogue itself.`;

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildAIHeaders(config),
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: instruction }],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `AI provider error ${response.status}`);
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content.trim();
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
