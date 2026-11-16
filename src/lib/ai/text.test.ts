import { describe, expect, it } from 'vitest';
import { safe } from './text';
import { answerToText } from '@/lib/richText';

describe('safe', () => {
  it.each([
    'x < 3 and y > 2',
    '\\(x<3\\) and \\(y>2\\)',
    'a<b, c>d',
    '0 < x < 5',
    'if p -> q then q <- p',
    '<x, y> is a vector',
  ])('keeps inequalities and angle brackets in maths: %s', (text) => {
    expect(safe(text)).toBe(text);
  });

  it('keeps an inequality typed in the answer editor all the way to the marker', () => {
    const html = '<p>x &lt; 3 and <span data-latex="y &gt; 2" data-type="inline-math"></span></p>';
    expect(safe(answerToText(html))).toBe('x < 3 and \\(y > 2\\)');
  });

  it('strips real tags, including ones with attributes', () => {
    expect(safe('<p>Area is <strong>4</strong> cm<sup>2</sup></p>')).toBe('Area is 4 cm2');
    expect(safe('<span data-type="inline-math" data-latex="x^2"></span> done')).toBe(' done');
    expect(safe('a<br/>b<br />c')).toBe('abc');
  });

  it('removes scripts, styles, comments and event handlers outright', () => {
    expect(safe('a<script>alert(1)</script>b')).toBe('ab');
    expect(safe('a<style>p{}</style>b<!-- hi -->c')).toBe('abc');
    expect(safe('<img src="x" onerror="alert(1)">ok')).toBe('ok');
    expect(safe('<a href="javascript:alert(1)">link</a>')).toBe('link');
  });
});
