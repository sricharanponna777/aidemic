export type HighlightSegment = { text: string; tone: 'recalled' | 'wrong' | null };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Split one line of a student's blurt into plain and highlighted runs, marking
 * every occurrence of a key term the review said they used. Longest terms are
 * tried first so "sinoatrial node" wins over "node", and matches are whole
 * words (with an optional plural s/es) so "cell" never lights up inside
 * "excellent".
 */
export function highlightTerms(
  line: string,
  terms: ReadonlyArray<{ term: string; status: 'recalled' | 'wrong' | 'missed' }>
): HighlightSegment[] {
  const usable = terms
    .filter((t) => t.status !== 'missed' && t.term.trim())
    .sort((a, b) => b.term.length - a.term.length);
  if (!line || usable.length === 0) return [{ text: line, tone: null }];

  const toneFor = new Map(usable.map((t) => [t.term.toLowerCase(), t.status as 'recalled' | 'wrong']));
  const pattern = new RegExp(`\\b(${usable.map((t) => escapeRegExp(t.term)).join('|')})(?:e?s)?\\b`, 'gi');

  const segments: HighlightSegment[] = [];
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ text: line.slice(last, start), tone: null });
    segments.push({ text: match[0], tone: toneFor.get(match[1].toLowerCase()) ?? 'recalled' });
    last = start + match[0].length;
  }
  if (last < line.length) segments.push({ text: line.slice(last), tone: null });
  return segments;
}
