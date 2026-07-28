/**
 * Resolving a question to the subtopic it tests.
 *
 * This is the join that the Learning Spine depends on: evidence is only useful
 * if it lands on a stable curriculum node (see the header of
 * supabase/migrations/20260728000000_add_learning_spine.sql).
 *
 * Lexical matching alone cannot do this job, and it is worth being clear why.
 * Subtopic names are abstract categories; questions are concrete instances:
 *
 *   subtopic  "Ionic bonding (formation, structure, properties of ionic compounds)"
 *   question  "Explain why sodium chloride has a high melting point."
 *
 * The token overlap is zero, but it is obviously the right subtopic. So the
 * production path is a closed-set LLM classification over the ~6 subtopics
 * under the resolved topic — cheap, evaluable, and the same
 * classification-over-generation pattern used for misconceptions.
 *
 * What this module provides is the FAST PATH: when a question does share
 * distinctive vocabulary with exactly one candidate, we can attribute it for
 * free and skip the model call entirely. Everything else falls through to the
 * classifier. Cheap wins first, model second.
 */

/**
 * Words that carry no discriminating power inside a subtopic name. Note that
 * genuinely technical words a spec writer leans on ("structure", "properties",
 * "formation") ARE removed: they appear in most subtopic names within a topic,
 * so keeping them makes every candidate look equally good.
 */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'in', 'on', 'to', 'for', 'with', 'from', 'by',
  'or', 'as', 'at', 'its', 'their', 'between',
  'structure', 'structures', 'property', 'properties', 'formation', 'forming',
  'including', 'simple', 'basic', 'general', 'use', 'uses', 'using',
]);

/** Score below which a lexical match is not trustworthy enough to use. */
export const MIN_MATCH_SCORE = 0.5;
/** A win must beat the runner-up by this much, or the field is too ambiguous. */
export const MIN_MATCH_MARGIN = 0.2;

export interface SubtopicCandidate {
  id: string;
  name: string;
}

export interface SubtopicMatch {
  id: string;
  score: number;
  /** Gap to the next-best candidate; low means the answer was nearly a tie. */
  margin: number;
}

/** Lowercases, strips punctuation and brackets, and drops noise words. */
export function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/**
 * How well `text` covers the distinctive vocabulary of `candidateName`.
 *
 * Deliberately asymmetric: we ask what fraction of the SUBTOPIC's words the
 * question uses, not the reverse. A long question that happens to mention every
 * word of a short subtopic name is a strong signal; a long subtopic name only
 * partially covered by a short question is not.
 */
export function scoreSubtopicMatch(candidateName: string, text: string): number {
  const candidateTokens = new Set(tokenize(candidateName));
  if (candidateTokens.size === 0) return 0;

  const textTokens = new Set(tokenize(text));
  if (textTokens.size === 0) return 0;

  let hits = 0;
  for (const token of candidateTokens) {
    if (textTokens.has(token)) hits += 1;
  }
  return hits / candidateTokens.size;
}

/**
 * Best lexical match among candidates, or null when the fast path should defer
 * to the LLM classifier.
 *
 * Returns null on a weak best score OR on a narrow margin — attributing
 * evidence to the wrong subtopic is worse than not attributing it at all,
 * because a wrong node corrupts the belief state silently and permanently.
 */
export function pickBestSubtopic(
  candidates: SubtopicCandidate[],
  text: string,
  { minScore = MIN_MATCH_SCORE, minMargin = MIN_MATCH_MARGIN } = {}
): SubtopicMatch | null {
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((candidate) => ({ id: candidate.id, score: scoreSubtopicMatch(candidate.name, text) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < minScore) return null;

  const runnerUp = scored[1]?.score ?? 0;
  const margin = best.score - runnerUp;
  // A single candidate cannot be ambiguous, so the margin rule does not apply.
  if (candidates.length > 1 && margin < minMargin) return null;

  return { id: best.id, score: best.score, margin };
}
