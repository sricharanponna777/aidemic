/**
 * Pure helpers for MathAnswerEditor, kept out of the component so they can be tested without a DOM.
 *
 * Answers are stored as the editor's HTML. `answerToText` in richText.ts turns that back into
 * markdown + LaTeX for the marker; `answerToEditorHtml` here goes the other way for text that
 * never came from the editor (an AI transcript of a scanned page, an answer saved before it).
 */

export type LatexSnippet = { id: string; label: string; title: string; before: string; after?: string };

/** The fx panel's palette. `after` wraps the selection; a symbol without it goes in at the caret. */
export const LATEX_SNIPPETS: LatexSnippet[] = [
  { id: 'fraction', label: 'a/b', title: 'Fraction', before: '\\frac{', after: '}{}' },
  { id: 'power', label: 'xⁿ', title: 'Power', before: '^{', after: '}' },
  { id: 'subscript', label: 'xₙ', title: 'Subscript', before: '_{', after: '}' },
  { id: 'sqrt', label: '√', title: 'Square root', before: '\\sqrt{', after: '}' },
  { id: 'root', label: 'ⁿ√', title: 'nth root', before: '\\sqrt[]{', after: '}' },
  { id: 'times', label: '×', title: 'Multiply', before: '\\times ' },
  { id: 'div', label: '÷', title: 'Divide', before: '\\div ' },
  { id: 'pm', label: '±', title: 'Plus or minus', before: '\\pm ' },
  { id: 'le', label: '≤', title: 'Less than or equal to', before: '\\le ' },
  { id: 'ge', label: '≥', title: 'Greater than or equal to', before: '\\ge ' },
  { id: 'neq', label: '≠', title: 'Not equal to', before: '\\neq ' },
  { id: 'approx', label: '≈', title: 'Approximately', before: '\\approx ' },
  { id: 'pi', label: 'π', title: 'Pi', before: '\\pi ' },
  { id: 'theta', label: 'θ', title: 'Theta', before: '\\theta ' },
  { id: 'degree', label: '°', title: 'Degrees', before: '^{\\circ}' },
  { id: 'infinity', label: '∞', title: 'Infinity', before: '\\infty ' },
];

export type SnippetResult = { value: string; selectionStart: number; selectionEnd: number };

/**
 * Insert a snippet into `value` at the selection `[start, end)`. A wrapping snippet keeps the
 * selected text selected inside it (select "x", press √, get `\sqrt{x}`); with nothing selected
 * the caret lands in its first slot. A symbol replaces nothing: it goes in after the selection.
 */
export function insertSnippet(value: string, start: number, end: number, snippet: LatexSnippet): SnippetResult {
  const from = snippet.after === undefined ? end : start;
  const selected = value.slice(from, end);
  const caret = from + snippet.before.length;
  return {
    value: `${value.slice(0, from)}${snippet.before}${selected}${snippet.after ?? ''}${value.slice(end)}`,
    selectionStart: caret,
    selectionEnd: caret + selected.length,
  };
}

const EDITOR_HTML = /^\s*<(?:p|ul|ol|div|h[1-6]|blockquote)\b/i;
// \( … \), \[ … \], $$ … $$, and $ … $ with no space just inside (so "$5 and $10" stays text).
const MATH_SEGMENT = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Text + LaTeX → editor HTML: one paragraph per line, each formula an inline maths node.
 * Editor HTML is passed through untouched (the editor's schema drops anything it doesn't know).
 */
export function answerToEditorHtml(value: string): string {
  if (!value.trim()) return '';
  if (EDITOR_HTML.test(value)) return value;
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      let html = '';
      let last = 0;
      for (const match of line.matchAll(MATH_SEGMENT)) {
        const latex = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? '').trim();
        html += escapeHtml(line.slice(last, match.index));
        html += latex ? `<span data-type="inline-math" data-latex="${escapeHtml(latex)}"></span>` : '';
        last = match.index + match[0].length;
      }
      return `<p>${html}${escapeHtml(line.slice(last))}</p>`;
    })
    .join('');
}
