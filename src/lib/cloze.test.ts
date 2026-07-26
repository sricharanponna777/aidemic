import { describe, expect, it } from 'vitest';
import { hasCloze, clozeIndices, revealAllCloze, maskAllCloze, expandCloze } from './cloze';

describe('hasCloze', () => {
  it('detects a well-formed cloze', () => {
    expect(hasCloze('The {{c1::mitochondrion}} makes ATP')).toBe(true);
  });
  it('returns false for plain text', () => {
    expect(hasCloze('The mitochondrion makes ATP')).toBe(false);
  });
  it('ignores malformed markers', () => {
    expect(hasCloze('this {{c1:no double colon}} is not cloze')).toBe(false);
    expect(hasCloze('{{cx::bad index}}')).toBe(false);
  });
});

describe('clozeIndices', () => {
  it('returns distinct indices in order', () => {
    expect(clozeIndices('{{c2::b}} and {{c1::a}} and {{c2::c}}')).toEqual([1, 2]);
  });
  it('returns empty for no cloze', () => {
    expect(clozeIndices('nothing here')).toEqual([]);
  });
});

describe('revealAllCloze', () => {
  it('strips every marker to its inner text', () => {
    expect(revealAllCloze('The {{c1::mitochondrion}} makes {{c2::ATP}}')).toBe(
      'The mitochondrion makes ATP'
    );
  });
});

describe('maskAllCloze', () => {
  it('masks every deletion on the card front', () => {
    expect(maskAllCloze('The {{c1::A}} bonds with {{c2::B}}')).toBe('The [ … ] bonds with [ … ]');
  });
  it('leaves plain text untouched', () => {
    expect(maskAllCloze('no cloze here')).toBe('no cloze here');
  });
});

describe('expandCloze', () => {
  it('returns empty array for non-cloze text (fallback to normal review)', () => {
    expect(expandCloze('plain card')).toEqual([]);
  });

  it('creates one item per distinct index', () => {
    const items = expandCloze('The {{c1::mitochondrion}} makes {{c2::ATP}}');
    expect(items).toHaveLength(2);
    expect(items[0].index).toBe(1);
    expect(items[0].masked).toBe('The [ … ] makes ATP');
    expect(items[0].answers).toEqual(['mitochondrion']);
    expect(items[1].index).toBe(2);
    expect(items[1].masked).toBe('The mitochondrion makes [ … ]');
    expect(items[1].answers).toEqual(['ATP']);
  });

  it('masks every occurrence of the same index at once', () => {
    const items = expandCloze('{{c1::Na}} and {{c1::Cl}} form salt');
    expect(items).toHaveLength(1);
    expect(items[0].masked).toBe('[ … ] and [ … ] form salt');
    expect(items[0].answers).toEqual(['Na', 'Cl']);
  });

  it('reveals all clozes in the revealed field', () => {
    const items = expandCloze('The {{c1::A}} and {{c2::B}}');
    expect(items[0].revealed).toBe('The A and B');
  });

  it('handles adjacent clozes and surrounding markdown', () => {
    const items = expandCloze('**{{c1::bold}}** {{c2::next}}');
    expect(items[0].masked).toBe('**[ … ]** next');
    expect(items[1].masked).toBe('**bold** [ … ]');
  });
});
