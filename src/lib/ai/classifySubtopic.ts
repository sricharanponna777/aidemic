import { buildAIHeaders, getAIConfig, getMissingHostedKeyError } from './config';
import { extractChatMessageText, extractFirstJsonObject, type ChatCompletionsResponseBody } from './json';
import type { SubtopicCandidate } from '../curriculum/subtopicMatch';

/**
 * Closed-set classification of questions onto curriculum subtopics.
 *
 * The lexical fast path in curriculum/subtopicMatch.ts resolves only the small
 * fraction of questions that share vocabulary with a subtopic name. Measured on
 * the existing attempt history it attributed 0 of 12 — subtopic names are
 * abstract categories ("Ionic bonding") and questions are concrete instances
 * ("why does sodium chloride have a high melting point"). So this is not a
 * fallback; it is the main path.
 *
 * It is still CLASSIFICATION, not generation: the model chooses an index from a
 * list of roughly six candidates, or -1. That keeps it cheap enough for a small
 * model, makes it directly evaluable against a fixture set, and means it can
 * never invent a curriculum node that does not exist — which a free-text
 * "what topic is this?" prompt absolutely would.
 *
 * All questions in one attempt go in a single call: they share the candidate
 * list, so batching turns N calls into one.
 */

/** Model returns this for a question that fits none of the candidates. */
export const NO_MATCH = -1;

export interface ClassificationResult {
  /** One subtopic id (or null) per input question, in order. */
  subtopicIds: (string | null)[];
  /** Set when the call failed outright; callers should skip, not guess. */
  error?: string;
}

const buildPrompt = (subtopics: SubtopicCandidate[], questions: string[]) => {
  const list = subtopics.map((s, i) => `${i}. ${s.name}`).join('\n');
  const items = questions.map((q, i) => `Q${i}: ${q.slice(0, 600)}`).join('\n\n');

  return [
    'You are mapping exam questions onto the subtopics of an exam specification.',
    '',
    'Subtopics:',
    list,
    '',
    'Questions:',
    items,
    '',
    'For each question, return the index of the single subtopic it primarily assesses.',
    `Use ${NO_MATCH} if the question does not fit any subtopic listed.`,
    'Judge by the underlying concept being tested, not by shared wording — a question',
    'about why sodium chloride has a high melting point assesses ionic bonding even',
    'though it does not use the word "ionic".',
    '',
    'Respond with JSON only, no prose:',
    '{"assignments": [{"q": 0, "subtopic": 2}, {"q": 1, "subtopic": -1}]}',
  ].join('\n');
};

type Assignment = { q?: number; subtopic?: number };

/** extractFirstJsonObject returns the JSON *substring*, so parse before coercing. */
const coerceAssignments = (json: string): Assignment[] | null => {
  if (!json) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const raw = (value as { assignments?: unknown }).assignments;
  if (!Array.isArray(raw)) return null;
  return raw.filter((item): item is Assignment => !!item && typeof item === 'object');
};

/**
 * Classify a batch of questions against one topic's subtopics.
 *
 * Returns nulls (never a guess) for anything the model declines or that comes
 * back malformed — a wrong subtopic silently corrupts the belief state, so an
 * unattributed question is strictly the safer failure.
 */
export async function classifyQuestionsToSubtopics(
  subtopics: SubtopicCandidate[],
  questions: string[]
): Promise<ClassificationResult> {
  const empty = questions.map(() => null);
  if (subtopics.length === 0 || questions.length === 0) return { subtopicIds: empty };

  const config = getAIConfig();
  const missingKey = getMissingHostedKeyError(config);
  if (missingKey) return { subtopicIds: empty, error: missingKey };

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: buildAIHeaders(config),
      body: JSON.stringify({
        model: config.model,
        // Classification, not composition: near-deterministic is what we want.
        temperature: 0,
        messages: [{ role: 'user', content: buildPrompt(subtopics, questions) }],
      }),
    });

    if (!response.ok) {
      return { subtopicIds: empty, error: `classification failed: ${response.status}` };
    }

    const body = (await response.json()) as ChatCompletionsResponseBody;
    const assignments = coerceAssignments(extractFirstJsonObject(extractChatMessageText(body)));
    if (!assignments) return { subtopicIds: empty, error: 'classification returned no usable JSON' };

    const out: (string | null)[] = [...empty];
    for (const assignment of assignments) {
      const questionIndex = Number(assignment.q);
      const subtopicIndex = Number(assignment.subtopic);
      if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= questions.length) continue;
      if (!Number.isInteger(subtopicIndex) || subtopicIndex < 0 || subtopicIndex >= subtopics.length) continue;
      out[questionIndex] = subtopics[subtopicIndex].id;
    }
    return { subtopicIds: out };
  } catch (err) {
    return { subtopicIds: empty, error: err instanceof Error ? err.message : 'classification threw' };
  }
}
