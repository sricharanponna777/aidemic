/**
 * Cloze deletion parsing.
 *
 * Cards may embed cloze deletions using Anki-style `{{c1::hidden text}}` syntax
 * (authored via the cloze button in RichTextEditor). The editor styles them, but
 * until now nothing hid them at review time, so cloze cards showed their own
 * answers. These helpers turn a card's front text into one review item per
 * distinct cloze index, masking that index and revealing the rest.
 *
 * A single card can contain multiple indices ({{c1::...}} and {{c2::...}}), and
 * an index can appear more than once — reviewing c1 hides every c1 occurrence.
 */

const CLOZE_PATTERN = /\{\{c(\d+)::(.*?)\}\}/g;

export interface ClozeCard {
  /** The 1-based cloze index being tested (c1, c2, …). */
  index: number;
  /** Front text with this index masked and all others revealed. */
  masked: string;
  /** Front text with every cloze revealed (the answer). */
  revealed: string;
  /** The hidden answer text(s) for this index. */
  answers: string[];
}

/** True if the text contains at least one well-formed cloze deletion. */
export function hasCloze(text: string): boolean {
  CLOZE_PATTERN.lastIndex = 0;
  return CLOZE_PATTERN.test(text);
}

/** The distinct cloze indices present, in ascending order. */
export function clozeIndices(text: string): number[] {
  CLOZE_PATTERN.lastIndex = 0;
  const found = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = CLOZE_PATTERN.exec(text)) !== null) {
    found.add(Number(m[1]));
  }
  return [...found].sort((a, b) => a - b);
}

/** Replace every cloze marker with its inner text (the fully revealed card). */
export function revealAllCloze(text: string): string {
  return text.replace(CLOZE_PATTERN, (_full, _idx, inner) => inner);
}

const MASK = "[ … ]";

/** Replace every cloze marker with the mask (the front of a cloze card). */
export function maskAllCloze(text: string): string {
  return text.replace(CLOZE_PATTERN, MASK);
}

/**
 * Expand a cloze-bearing string into one review item per distinct index.
 * Non-cloze text returns an empty array (callers fall back to normal review).
 */
export function expandCloze(text: string): ClozeCard[] {
  const indices = clozeIndices(text);
  if (indices.length === 0) return [];

  return indices.map((index) => {
    const answers: string[] = [];
    const masked = text.replace(CLOZE_PATTERN, (_full, idx, inner) => {
      if (Number(idx) === index) {
        answers.push(inner);
        return MASK;
      }
      return inner; // other indices are shown as plain text
    });
    return {
      index,
      masked,
      revealed: revealAllCloze(text),
      answers,
    };
  });
}
