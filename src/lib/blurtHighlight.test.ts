import { describe, expect, it } from 'vitest';
import { highlightTerms } from './blurtHighlight';

const join = (line: string, terms: Parameters<typeof highlightTerms>[1]) =>
  highlightTerms(line, terms)
    .map((s) => (s.tone ? `[${s.text}:${s.tone}]` : s.text))
    .join('');

describe('highlightTerms', () => {
  it('marks recalled and wrong terms, ignoring missed ones and case', () => {
    expect(
      join('The Sinoatrial node fires; the AVN delays it.', [
        { term: 'sinoatrial node', status: 'recalled' },
        { term: 'AVN', status: 'wrong' },
        { term: 'bundle of His', status: 'missed' },
      ])
    ).toBe('The [Sinoatrial node:recalled] fires; the [AVN:wrong] delays it.');
  });

  it('prefers the longest term and matches whole words with plurals', () => {
    expect(
      join('Each node and the sinoatrial node; valves open. Excellent.', [
        { term: 'node', status: 'recalled' },
        { term: 'sinoatrial node', status: 'recalled' },
        { term: 'valve', status: 'recalled' },
        { term: 'cell', status: 'recalled' },
      ])
    ).toBe('Each [node:recalled] and the [sinoatrial node:recalled]; [valves:recalled] open. Excellent.');
  });

  it('treats regex characters in a term literally', () => {
    expect(join('Use F = ma (Newton).', [{ term: 'F = ma', status: 'recalled' }])).toBe('Use [F = ma:recalled] (Newton).');
  });

  it('returns the line untouched with nothing to mark', () => {
    expect(highlightTerms('', [{ term: 'x', status: 'recalled' }])).toEqual([{ text: '', tone: null }]);
    expect(highlightTerms('abc', [])).toEqual([{ text: 'abc', tone: null }]);
  });
});
