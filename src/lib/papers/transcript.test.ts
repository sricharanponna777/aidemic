import { describe, expect, it } from 'vitest';
import { coerceTranscript, transcriptToAnswers } from './transcript';

describe('coerceTranscript', () => {
  it('fills a gap rather than shifting later answers onto the wrong question', () => {
    // A vision model that finds nothing for question 1 returns two entries, not
    // three. Marking indexes answers positionally, so a sparse array would mark
    // question 2's answer against question 1.
    const transcript = coerceTranscript(
      [
        { questionIndex: 0, text: 'first', confidence: 0.9 },
        { questionIndex: 2, text: 'third', confidence: 0.8 },
      ],
      3
    );

    expect(transcript.map((entry) => entry.text)).toEqual(['first', '', 'third']);
    expect(transcript[1].confidence).toBe(0);
  });

  it('orders entries by question index whatever order they arrive in', () => {
    const transcript = coerceTranscript(
      [
        { questionIndex: 2, text: 'c', confidence: 1 },
        { questionIndex: 0, text: 'a', confidence: 1 },
        { questionIndex: 1, text: 'b', confidence: 1 },
      ],
      3
    );

    expect(transcript.map((entry) => entry.text)).toEqual(['a', 'b', 'c']);
  });

  it('drops an index outside the paper', () => {
    const transcript = coerceTranscript(
      [
        { questionIndex: 0, text: 'kept', confidence: 1 },
        { questionIndex: 9, text: 'invented', confidence: 1 },
        { questionIndex: -1, text: 'negative', confidence: 1 },
      ],
      2
    );

    expect(transcript).toHaveLength(2);
    expect(JSON.stringify(transcript)).not.toContain('invented');
    expect(JSON.stringify(transcript)).not.toContain('negative');
  });

  it('keeps the first of two entries for the same question', () => {
    const transcript = coerceTranscript(
      [
        { questionIndex: 0, text: 'first guess', confidence: 0.9 },
        { questionIndex: 0, text: 'second guess', confidence: 0.4 },
      ],
      1
    );

    expect(transcript[0].text).toBe('first guess');
  });

  it('clamps confidence into 0-1 and defaults a missing one to 0', () => {
    const transcript = coerceTranscript(
      [
        { questionIndex: 0, text: 'a', confidence: 4 },
        { questionIndex: 1, text: 'b', confidence: -2 },
        { questionIndex: 2, text: 'c' },
      ],
      3
    );

    expect(transcript.map((entry) => entry.confidence)).toEqual([1, 0, 0]);
  });

  it('survives malformed model output', () => {
    expect(coerceTranscript(null, 2)).toEqual([
      { questionIndex: 0, text: '', confidence: 0 },
      { questionIndex: 1, text: '', confidence: 0 },
    ]);
    expect(coerceTranscript('not an array', 1)).toHaveLength(1);
    expect(coerceTranscript([null, 7, { text: 'no index' }], 1)[0].text).toBe('');
  });

  it('coerces a non-string text to empty rather than "undefined"', () => {
    const transcript = coerceTranscript([{ questionIndex: 0, text: 42, confidence: 1 }], 1);

    expect(transcript[0].text).toBe('');
  });

  it('infers the length from the entries when no question count is given', () => {
    expect(coerceTranscript([{ questionIndex: 2, text: 'c', confidence: 1 }])).toHaveLength(3);
    expect(coerceTranscript([])).toHaveLength(0);
  });
});

describe('transcriptToAnswers', () => {
  it('produces one positional answer per question', () => {
    const answers = transcriptToAnswers(
      [
        { questionIndex: 1, text: 'second', confidence: 1 },
        { questionIndex: 0, text: 'first', confidence: 1 },
      ],
      3
    );

    expect(answers).toEqual(['first', 'second', '']);
  });
});
