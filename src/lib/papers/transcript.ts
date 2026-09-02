import { txt } from '@/lib/ai/text';
import type { PaperTranscriptEntry } from '@/types';

/** Below this the review UI flags the entry rather than letting it slide past. */
export const LOW_CONFIDENCE = 0.7;

const MAX_ANSWER_CHARS = 4000;

/**
 * Coerce a transcript into a dense, in-order entry per question.
 *
 * Two things make this more than a cast. A vision model asked for twelve
 * answers routinely returns eleven -- a blank page reads as nothing to say --
 * and the marking route indexes `answers[i]` positionally, so a sparse array
 * would silently shift every answer after the gap onto the wrong question. And
 * the same transcript is re-coerced after the student edits it in the browser,
 * where the entries are plain untrusted input.
 *
 * Anything missing becomes an empty string, which marks as zero: the honest
 * outcome for a question the student left blank, and a visible one in the
 * review UI for a page that failed to transcribe.
 */
export function coerceTranscript(raw: unknown, questionCount?: number): PaperTranscriptEntry[] {
  const byIndex = new Map<number, PaperTranscriptEntry>();

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;

      const rawIndex =
        typeof record.questionIndex === 'number' ? record.questionIndex : Number(record.questionIndex);
      if (!Number.isFinite(rawIndex)) continue;
      const questionIndex = Math.trunc(rawIndex);
      if (questionIndex < 0) continue;
      if (questionCount !== undefined && questionIndex >= questionCount) continue;
      // First entry wins: a model that answers question 3 twice has guessed,
      // and the later guess is not more trustworthy than the earlier one.
      if (byIndex.has(questionIndex)) continue;

      const rawConfidence =
        typeof record.confidence === 'number' ? record.confidence : Number(record.confidence);

      byIndex.set(questionIndex, {
        questionIndex,
        text: typeof record.text === 'string' ? txt(record.text, MAX_ANSWER_CHARS) : '',
        confidence: Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0,
      });
    }
  }

  const length = questionCount ?? (byIndex.size === 0 ? 0 : Math.max(...byIndex.keys()) + 1);

  return Array.from({ length }, (_unused, questionIndex) =>
    byIndex.get(questionIndex) ?? { questionIndex, text: '', confidence: 0 }
  );
}

/** The positional `answers` array the marking route expects. */
export function transcriptToAnswers(transcript: PaperTranscriptEntry[], questionCount: number): string[] {
  const dense = coerceTranscript(transcript, questionCount);
  return dense.map((entry) => entry.text);
}
