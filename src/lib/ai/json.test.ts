import { describe, expect, it } from 'vitest';
import { parseJsonLenient } from './json';

describe('parseJsonLenient', () => {
  it('parses valid JSON unchanged', () => {
    expect(parseJsonLenient(String.raw`{"q":"\\(\\frac{1}{2}\\)","n":"a\nb"}`)).toEqual({ q: '\\(\\frac{1}{2}\\)', n: 'a\nb' });
  });

  it('repairs single-escaped LaTeX that would fail JSON.parse', () => {
    expect(parseJsonLenient(String.raw`{"q":"\(\sqrt{2} + \frac{1}{2} + \theta\)"}`)).toEqual({
      q: String.raw`\(\sqrt{2} + \frac{1}{2} + \theta\)`,
    });
  });

  it('keeps a real newline before "u = 5" rather than turning it into \\nu', () => {
    expect(parseJsonLenient(String.raw`{"q":"\(\sqrt{2}\)\nu = 5"}`)).toEqual({ q: '\\(\\sqrt{2}\\)\nu = 5' });
  });

  it('still throws on JSON that is broken for other reasons', () => {
    expect(() => parseJsonLenient('{"q": ')).toThrow();
  });
});
