import { describe, expect, it } from 'vitest';
import { answerToEditorHtml, insertSnippet, LATEX_SNIPPETS } from './answerEditor';
import { answerToText } from './richText';

const snippet = (id: string) => LATEX_SNIPPETS.find((s) => s.id === id)!;
/** Insert at the selection marked by [ ] in `marked`, and show the result's selection the same way. */
const insert = (marked: string, id: string) => {
  const start = marked.indexOf('[');
  const end = marked.indexOf(']') - 1;
  const value = marked.replace('[', '').replace(']', '');
  const result = insertSnippet(value, start, end, snippet(id));
  return `${result.value.slice(0, result.selectionStart)}[${result.value.slice(result.selectionStart, result.selectionEnd)}]${result.value.slice(result.selectionEnd)}`;
};

describe('insertSnippet', () => {
  it('leaves the caret in the first slot of an empty structure', () => {
    expect(insert('x = []', 'fraction')).toBe('x = \\frac{[]}{}');
  });

  it('wraps the selection and keeps it selected', () => {
    expect(insert('[x]', 'sqrt')).toBe('\\sqrt{[x]}');
  });

  it('puts a symbol after the selection without replacing it', () => {
    expect(insert('[3]', 'times')).toBe('3\\times []');
  });
});

describe('answerToEditorHtml', () => {
  it('turns each formula into a maths node and each line into a paragraph', () => {
    expect(answerToEditorHtml('x = \\(\\frac{1}{2}\\)\nso y = $2$')).toBe(
      '<p>x = <span data-type="inline-math" data-latex="\\frac{1}{2}"></span></p>' +
        '<p>so y = <span data-type="inline-math" data-latex="2"></span></p>',
    );
  });

  it('escapes text and LaTeX alike', () => {
    expect(answerToEditorHtml('a < b & \\(x<3\\)')).toBe(
      '<p>a &lt; b &amp; <span data-type="inline-math" data-latex="x&lt;3"></span></p>',
    );
  });

  it('leaves prices as text', () => {
    expect(answerToEditorHtml('It costs $5 and $10')).toBe('<p>It costs $5 and $10</p>');
  });

  it('passes editor HTML through and keeps empty empty', () => {
    expect(answerToEditorHtml('<p><strong>hi</strong></p>')).toBe('<p><strong>hi</strong></p>');
    expect(answerToEditorHtml('   ')).toBe('');
  });
});

describe('answerToText (what the marker reads)', () => {
  it('turns maths nodes back into LaTeX, decoding entities once', () => {
    const html = answerToEditorHtml('so \\(x<3\\) & done');
    expect(answerToText(html)).toBe('so \\(x<3\\) & done');
  });

  it('keeps bold, lists, numbering and sub/superscripts; drops colour, highlight and alignment', () => {
    const html =
      '<p style="text-align: center">Area is <strong>4</strong> cm<sup>2</sup> and <mark data-color="#ff0">H<sub>2</sub>O</mark>' +
      ' in <span style="color: rgb(239, 68, 68)">red</span></p>' +
      '<ol><li><p>first</p></li><li><p>second</p></li></ol><ul><li><p>dot</p></li></ul>';
    expect(answerToText(html)).toBe(
      'Area is **4** \\(cm^{2}\\) and \\(H_{2}\\)O in red\n\n1. first\n2. second\n\n- dot',
    );
  });

  it('superscripts the whole number, not its last digit', () => {
    expect(answerToText('<p>10<sup>3</sup> and 1.5<sup>2</sup></p>')).toBe('\\(10^{3}\\) and \\(1.5^{2}\\)');
  });

  it('leaves non-editor answers alone', () => {
    expect(answerToText('B')).toBe('B');
    expect(answerToText('{"points":[[1,2]]}')).toBe('{"points":[[1,2]]}');
    expect(answerToText('x < 3 and y > 2')).toBe('x < 3 and y > 2');
  });
});
