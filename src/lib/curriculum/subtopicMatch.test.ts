import { describe, expect, it } from 'vitest';
import {
  pickBestSubtopic,
  scoreSubtopicMatch,
  tokenize,
  MIN_MATCH_SCORE,
  type SubtopicCandidate,
} from './subtopicMatch';

/** The real AQA GCSE Chemistry "Bonding, structure and properties of matter" subtopics. */
const BONDING: SubtopicCandidate[] = [
  { id: 'ionic', name: 'Ionic bonding (formation, structure, properties of ionic compounds)' },
  { id: 'covalent', name: 'Covalent bonding (formation, simple molecular structures, properties)' },
  { id: 'giant', name: 'Giant covalent structures (diamond, graphite, silicon dioxide)' },
  { id: 'metallic', name: 'Metallic bonding (structure, properties of metals and alloys)' },
  { id: 'states', name: 'States of matter (solids, liquids, gases) and state changes' },
  { id: 'particle', name: 'Limitations of simple particle model, nanoparticles' },
];

describe('tokenize', () => {
  it('drops punctuation and brackets', () => {
    expect(tokenize('Ionic bonding (formation, structure)')).toEqual(['ionic', 'bonding']);
  });

  it('drops words too short to discriminate', () => {
    expect(tokenize('the pH of an acid')).toEqual(['acid']);
  });

  it('drops spec-writer filler that appears in every candidate', () => {
    // "structure" and "properties" occur in four of the six bonding subtopics,
    // so keeping them would make every candidate score alike.
    expect(tokenize('structure and properties of metals')).toEqual(['metals']);
  });

  it('returns nothing for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('scoreSubtopicMatch', () => {
  it('is 1 when the text uses every distinctive word', () => {
    expect(scoreSubtopicMatch('Metallic bonding (properties of metals and alloys)',
      'Describe metallic bonding in metals and alloys')).toBe(1);
  });

  it('is 0 when nothing overlaps', () => {
    expect(scoreSubtopicMatch('Ionic bonding (formation of ionic compounds)',
      'Calculate the mean of these results')).toBe(0);
  });

  it('is partial when only some words are used', () => {
    const score = scoreSubtopicMatch(
      'Giant covalent structures (diamond, graphite, silicon dioxide)',
      'Explain why graphite conducts electricity but diamond does not'
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('is 0 for empty input on either side', () => {
    expect(scoreSubtopicMatch('', 'anything')).toBe(0);
    expect(scoreSubtopicMatch('Ionic bonding', '')).toBe(0);
  });
});

describe('pickBestSubtopic', () => {
  it('resolves a question that names its subtopic directly', () => {
    const match = pickBestSubtopic(BONDING, 'Describe the bonding in metallic alloys and metals.');
    expect(match?.id).toBe('metallic');
    expect(match?.score).toBeGreaterThanOrEqual(MIN_MATCH_SCORE);
  });

  it('resolves states of matter', () => {
    const match = pickBestSubtopic(BONDING, 'Name the three states of matter and describe changes of state.');
    expect(match?.id).toBe('states');
  });

  it('refuses to guess when two subtopics tie', () => {
    // Attributing this to either one would silently corrupt the belief state.
    expect(pickBestSubtopic(BONDING, 'Compare ionic bonding and covalent bonding.')).toBeNull();
  });

  it('refuses a weak best match', () => {
    expect(pickBestSubtopic(BONDING, 'Calculate the relative formula mass of water.')).toBeNull();
  });

  it('defers on concrete instances of an abstract category', () => {
    // The documented limitation, and the reason the LLM classifier exists:
    // this is obviously ionic bonding, and shares not one word with its name.
    expect(pickBestSubtopic(BONDING, 'Explain why sodium chloride has a high melting point.')).toBeNull();
  });

  it('returns null for an empty candidate list', () => {
    expect(pickBestSubtopic([], 'anything at all')).toBeNull();
  });

  it('does not apply the margin rule to a lone candidate', () => {
    const only = [{ id: 'states', name: 'States of matter (solids, liquids, gases) and state changes' }];
    expect(pickBestSubtopic(only, 'Name the three states of matter and describe state changes.')?.id)
      .toBe('states');
  });

  it('reports the margin so callers can log near-misses', () => {
    const match = pickBestSubtopic(BONDING, 'Describe the bonding in metallic alloys and metals.');
    expect(match?.margin).toBeGreaterThan(0);
  });
});
