import { describe, expect, it } from 'vitest';
import { normalizeMathNotation } from './math';

const norm = (value: string) => normalizeMathNotation(value, 'mathematics');

describe('normalizeMathNotation', () => {
  it('leaves existing commands alone', () => {
    expect(norm('Area is $\\pi r^{2}$')).toBe('Area is $\\pi r^{2}$');
    expect(norm('\\(\\sqrt(2)\\)')).toBe('\\(\\sqrt(2)\\)');
    expect(norm('\\(\\infty\\)')).toBe('\\(\\infty\\)');
  });

  it('upgrades plain-text notation inside delimiters', () => {
    expect(norm('\\(pi r^2\\)')).toBe('\\(\\pi r^{2}\\)');
    expect(norm('\\(sqrt(x + 1)\\)')).toBe('\\(\\sqrt{x + 1}\\)');
    expect(norm('\\((a+b)/(c)\\)')).toBe('\\(\\frac{a+b}{c}\\)');
  });

  it('does not touch index variables or text', () => {
    expect(norm('$\\sum_{i=1}^{n} i$')).toBe('$\\sum_{i=1}^{n} i$');
    expect(norm('$\\text{e.g. } e^{x}$')).toBe('$\\text{e.g. } e^{x}$');
  });

  it('keeps the exponent to one term', () => {
    expect(norm('\\(x^2+3x\\)')).toBe('\\(x^{2}+3x\\)');
    expect(norm('\\(x^-1\\)')).toBe('\\(x^{-1}\\)');
  });

  it('is idempotent', () => {
    for (const source of ['\\(pi r^2\\)', '$\\pi$', '\\[sqrt(2) x_1 + inf\\]', '$\\sum_{i=1} e^{i\\pi}$']) {
      const once = norm(source);
      expect(norm(once)).toBe(once);
    }
  });

  it('only applies to maths subjects and delimited text', () => {
    expect(normalizeMathNotation('$pi$', 'history')).toBe('$pi$');
    expect(norm('pi is about 3.14')).toBe('pi is about 3.14');
  });
});
