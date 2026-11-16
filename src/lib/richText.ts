/**
 * Markdown + LaTeX → HTML, as one pure function.
 *
 * Every piece of AI- or user-authored study text in the app goes through here (via
 * MarkdownContent). It used to inject HTML and then let KaTeX auto-render
 * rewrite the live DOM, which made the result impossible to test, re-scanned the page on
 * every render, and handed delimiter detection to a library that reads "$5 and $10" as
 * maths. Rendering each formula with katex.renderToString instead means:
 *
 * - **Delimiters are ours.** `\(..\)`, `\[..\]`, `$$..$$` and `$..$`, with the pandoc rule
 *   for single dollars (no space inside either end, closing `$` not followed by a digit), so
 *   prices stay prices.
 * - **A formula that fails never shows red.** Each one is retried with common LLM mistakes
 *   repaired, then falls back to its source as plain text.
 * - **Output is identical on server and client**, so there is no hydration mismatch and no
 *   flash of raw TeX.
 *
 * KaTeX output is safe HTML (`trust: false`); everything else is escaped here.
 */
import katex from 'katex';
import 'katex/contrib/mhchem';
import { LATEX_COMMAND_PATTERN, normalizeEquationEnvironments, normalizeLatexControlCharacters } from '@/lib/mathText';

/** `markdown`: blocks and inline formatting. `inline`: one line, inline formatting only.
 *  `plain`: no markdown at all (a student's typed answer), just maths and line breaks. */
export type RichTextMode = 'markdown' | 'inline' | 'plain';

const OPEN = '\uE000';
const CLOSE = '\uE001';
const PLACEHOLDER = /\uE000(\d+)\uE001/g;

// siunitx is the other notation models reach for in physics; KaTeX has no package for it.
const KATEX_MACROS: Record<string, string> = {
  '\\si': '\\mathrm{#1}',
  '\\unit': '\\mathrm{#1}',
  '\\SI': '#1\\,\\mathrm{#2}',
  '\\qty': '#1\\,\\mathrm{#2}',
  '\\num': '#1',
  '\\textdegree': '\\degree',
};

const MATH_ENVIRONMENTS =
  'aligned|align\\*?|alignat\\*?|gather\\*?|gathered|equation\\*?|cases|array|split|smallmatrix|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix';
const MATRIX_ENVIRONMENT = '((?:p|b|B|v|V)?matrix)';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Math ──────────────────────────────────────────────────────────────────────────────

function escapeStrayMathChars(tex: string): string {
  // `%` starts a TeX comment, so "\(50%\)" silently rendered as "50" and dropped the rest.
  // `#` is a macro parameter and errors. `&` is only meaningful inside an environment.
  let next = tex.replace(/(^|[^\\])%/g, '$1\\%').replace(/(^|[^\\])#/g, '$1\\#');
  if (!/\\begin\{/.test(next)) next = next.replace(/(^|[^\\])&/g, '$1\\&');
  return next.replace(/\\text\{det\}/g, '\\det').replace(/\^-1(?![0-9])/g, '^{-1}');
}

function balanceBraces(tex: string): string {
  let depth = 0;
  let result = '';
  for (let i = 0; i < tex.length; i += 1) {
    const ch = tex[i];
    if (ch === '\\') {
      result += ch + (tex[i + 1] ?? '');
      i += 1;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      if (depth === 0) continue; // drop an unmatched closer
      depth -= 1;
    }
    result += ch;
  }
  return result + '}'.repeat(depth);
}

function renderKatex(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: true,
    strict: 'ignore',
    trust: false,
    macros: { ...KATEX_MACROS },
  });
}

// Over-escaped JSON turns \frac into \\frac, which is *valid* TeX — a line break followed by the
// letters "frac" — so KaTeX renders it without error and the retry below never runs. Un-double
// in front of a known command up front. A real break before a command is written `\\ \frac` or
// `\\\frac`, and neither matches.
const DOUBLED_COMMAND = new RegExp(String.raw`(?<!\\)\\\\(?=${LATEX_COMMAND_PATTERN}(?![A-Za-z]))`, 'g');

export function renderMath(source: string, displayMode: boolean): string {
  const tex = escapeStrayMathChars(source.trim()).replace(DOUBLED_COMMAND, '\\');
  if (!tex) return '';

  // Over-escaped JSON ("\\\\frac") arrives as \\frac, which KaTeX reads as a line break.
  const unDoubled = tex.replace(/\\\\(?=[A-Za-z])/g, '\\').replace(/(^|[^\\])\\$/, '$1');
  const candidates = [tex, unDoubled, balanceBraces(unDoubled)];

  for (const candidate of new Set(candidates)) {
    try {
      return renderKatex(candidate, displayMode);
    } catch {
      // try the next repair
    }
  }
  return `<span class="math-fallback">${escapeHtml(source.trim())}</span>`;
}

// ─── Source normalisation ──────────────────────────────────────────────────────────────

const HTML_TAG = /<\/?(?:p|div|span|br|b|strong|i|em|u|s|del|sub|sup|ul|ol|li|h[1-6]|code|pre|blockquote|mark|hr)\b[^<>]*>/i;

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

// A Tiptap maths node: `<span data-latex="x^2" data-type="inline-math"></span>`, or a block one in
// a div. The LaTeX stays entity-encoded here and is decoded once with everything else.
const MATH_NODE = /<(span|div)\b([^>]*\bdata-type="(inline|block)-math"[^>]*)>[\s\S]*?<\/\1>/gi;

/** Number the items of each `<ol>`, which would otherwise come out as bullets. */
function numberOrderedLists(value: string): string {
  return value.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_m, body: string) => {
    let n = 0;
    return `${body.replace(/<li\b[^>]*>/gi, () => `\n${(n += 1)}. `)}\n\n`;
  });
}

/**
 * Flashcards (RichTextEditor) and typed answers (MathAnswerEditor) are stored as Tiptap HTML.
 * Turn the handful of tags it produces back into markdown so they keep their meaning, then
 * decode entities — otherwise "&amp;" was escaped a second time and shown literally. Only tag
 * names we know are touched, so "a < b and c > d" in plain text is left alone. Colour, highlight,
 * underline and alignment have no markdown form and are dropped.
 */
function htmlToMarkdown(value: string): string {
  const stripTags = (inner: string) => inner.replace(/<[^>]*>/g, '').trim();
  const next = numberOrderedLists(value.replace(/<li\b([^>]*)>\s*<p\b[^>]*>([\s\S]*?)<\/p>/gi, '<li$1>$2'))
    // The base is the whole word or number, so 10<sup>3</sup> is 10³, not 1 then 0³.
    .replace(/([A-Za-z0-9]+(?:\.\d+)?|[)\]])\s*<sub>([\s\S]*?)<\/sub>/gi, (_m, base: string, sub: string) =>
      stripTags(sub) ? `\\(${base}_{${stripTags(sub)}}\\)` : base)
    .replace(/([A-Za-z0-9]+(?:\.\d+)?|[)\]])\s*<sup>([\s\S]*?)<\/sup>/gi, (_m, base: string, sup: string) =>
      stripTags(sup) ? `\\(${base}^{${stripTags(sup)}}\\)` : base)
    .replace(MATH_NODE, (_m, _tag, attrs: string, kind: string) => {
      const latex = attrs.match(/\bdata-latex="([^"]*)"/)?.[1]?.trim() ?? '';
      if (!latex) return '';
      return kind === 'inline' ? `\\(${latex}\\)` : `\n\n\\[${latex}\\]\n\n`;
    })
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner: string) => (inner.trim() ? `**${inner}**` : inner))
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner: string) => (inner.trim() ? `*${inner}*` : inner))
    .replace(/<(s|del)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner: string) => (inner.trim() ? `~~${inner}~~` : inner))
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_m, inner: string) => `\`${inner}\``)
    .replace(/<h([1-6])\b[^>]*>/gi, (_m, level: string) => `\n${'#'.repeat(Number(level))} `)
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<hr\b[^>]*>/gi, '\n\n---\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|ul|ol|blockquote|pre)>/gi, '\n\n')
    .replace(new RegExp(HTML_TAG.source, 'gi'), '');
  return decodeEntities(next).replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * A typed answer as the marker should read it: editor HTML becomes markdown + `\( … \)` LaTeX;
 * anything else (an older plain-text answer, an MCQ letter, plot/diagram JSON) is returned as is.
 */
export function answerToText(value: string): string {
  return HTML_TAG.test(value) ? htmlToMarkdown(value) : value;
}

function normalizeLatexMatrices(value: string): string {
  const matrixRegex = new RegExp(`\\\\begin\\{${MATRIX_ENVIRONMENT}\\}([\\s\\S]*?)\\\\end\\{\\1\\}`, 'g');
  return value.replace(matrixRegex, (_match, environment: string, body: string) => {
    const cleanedBody = body
      .replace(/\\\s*$/g, '')
      .replace(/(?:\s*\\\\\s*)+$/g, '')
      .replace(/\\\\\s*(?:\\\\\s*)+/g, '\\\\ ')
      .replace(/\s+/g, ' ')
      .trim();
    return `\\begin{${environment}} ${cleanedBody} \\end{${environment}}`;
  });
}

// "If A = \begin{pmatrix}..\end{pmatrix}, find A^-1" with no delimiters: show the formula as display maths.
function wrapBareMatrixFormulaLines(value: string): string {
  const containsMatrix = new RegExp(`\\\\begin\\{${MATRIX_ENVIRONMENT}\\}`);
  return value
    .split('\n')
    .flatMap((line) => {
      if (!containsMatrix.test(line) || /(?:\\\[|\\\(|\$)/.test(line)) return [line];
      const indent = line.match(/^\s*/)?.[0] ?? '';
      const trimmed = line.trim();
      const ifMatch = trimmed.match(/^If\s+(.+)$/i);
      const expression = ifMatch ? ifMatch[1] : trimmed;
      if (!/[=&]|\\frac|\\det|\\text\{det\}/.test(expression)) return [line];
      const displayLine = `${indent}\\[ ${expression} \\]`;
      return ifMatch ? [`${indent}If`, displayLine] : [displayLine];
    })
    .join('\n');
}

// "a single power of \\a\\." \u2014 an over-escaped \(a\) that lost its brackets. Only a lone letter
// standing as its own word, so a matrix row break like `1 \\ 2` is never touched.
const DOUBLED_SLASH_LETTER = /(^|[\s(])\\\\([A-Za-z])\\\\(?=$|[\s.,;:!?)])/g;

function normalizeSource(raw: string): string {
  let text = normalizeLatexControlCharacters(String(raw ?? ''))
    .replace(/[\uE000\uE001]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(DOUBLED_SLASH_LETTER, '$1\\($2\\)');
  if (HTML_TAG.test(text)) text = htmlToMarkdown(text);
  text = normalizeEquationEnvironments(text);
  text = normalizeLatexMatrices(text);
  return wrapBareMatrixFormulaLines(text);
}

// ─── Tokenising ────────────────────────────────────────────────────────────────────────
//
// Math, code spans and a few literal characters are cut out of the text and replaced by
// private-use placeholders before any markdown runs, so `*` and `_` inside a formula, or
// `|` inside |x|, are never read as markdown.

class Tokens {
  private readonly html: string[] = [];

  add(html: string): string {
    this.html.push(html);
    return `${OPEN}${this.html.length - 1}${CLOSE}`;
  }

  restore(value: string): string {
    // Link text may itself hold placeholders, so restore until none remain.
    let next = value;
    for (let pass = 0; pass < 3 && next.includes(OPEN); pass += 1) {
      next = next.replace(PLACEHOLDER, (match, index: string) => this.html[Number(index)] ?? match);
    }
    return next;
  }
}

function isEscaped(value: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && value[i] === '\\'; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

/** Closing `$` for a `$` at `start - 1`: same line, no space just inside, not followed by a digit. */
function findClosingDollar(value: string, start: number): number {
  if (start >= value.length || /\s/.test(value[start])) return -1;
  for (let i = start; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '\n') return -1;
    if (ch !== '$' || isEscaped(value, i)) continue;
    if (value[i + 1] === '$') return -1;
    if (/\s/.test(value[i - 1]) || /\d/.test(value[i + 1] ?? '')) continue;
    return i;
  }
  return -1;
}

function findUnescaped(value: string, needle: string, from: number): number {
  let index = value.indexOf(needle, from);
  while (index !== -1 && isEscaped(value, index)) index = value.indexOf(needle, index + 1);
  return index;
}

// One brace group, up to three levels deep.
const BRACE_GROUP = String.raw`\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}`;
const BARE_LATEX = new RegExp(
  String.raw`\\{1,2}${LATEX_COMMAND_PATTERN}(?![A-Za-z])` +
    String.raw`(?:[ \t]*(?:${BRACE_GROUP}|\\{1,2}[A-Za-z]+|\d+(?:\.\d+)?|[A-Za-z](?![A-Za-z])|[\^_+\-*/=<>|()[\],.!']))*`,
  'g',
);

/** Trim a bare-LaTeX match back to something that reads as one formula. */
function trimBareLatex(match: string): string {
  let expr = match.replace(/[\s,.([]+$/, '');
  const count = (re: RegExp) => (expr.match(re) ?? []).length;
  while (expr.length > 1 && (count(/\(/g) < count(/\)/g) || count(/\[/g) < count(/\]/g))) {
    expr = expr.slice(0, -1).replace(/[\s,.]+$/, '');
  }
  while (expr.length > 1 && (count(/\(/g) > count(/\)/g) || count(/\[/g) > count(/\]/g))) {
    const lastOpen = Math.max(expr.lastIndexOf('('), expr.lastIndexOf('['));
    expr = expr.slice(0, lastOpen).replace(/[\s,.]+$/, '');
  }
  return expr;
}

/** LaTeX commands typed without delimiters in prose → inline maths. */
function wrapBareLatex(text: string, tokens: Tokens): string {
  return text.replace(BARE_LATEX, (match: string) => {
    const expr = trimBareLatex(match);
    if (!/^\\{1,2}[A-Za-z]/.test(expr)) return match;
    const rest = match.slice(expr.length);
    return tokens.add(renderMath(expr.replace(/^\\\\/, '\\'), false)) + rest;
  });
}

/**
 * Replace every maths segment (and, outside plain mode, every code span) with a placeholder.
 * Fenced code blocks are copied through untouched for the block parser.
 */
function tokenize(text: string, mode: RichTextMode, tokens: Tokens): string {
  let out = '';
  let buffer = '';
  let i = 0;
  const flush = () => {
    out += wrapBareLatex(buffer, tokens);
    buffer = '';
  };
  const emitMath = (tex: string, display: boolean) => {
    flush();
    out += tokens.add(renderMath(tex, display));
  };

  while (i < text.length) {
    const atLineStart = i === 0 || text[i - 1] === '\n';

    if (mode === 'markdown' && atLineStart && /^ {0,3}(```|~~~)/.test(text.slice(i, i + 6))) {
      const fence = text.slice(i).match(/^ {0,3}(```|~~~)/)![1];
      const lineEnd = text.indexOf('\n', i);
      const closeAt = lineEnd === -1 ? -1 : text.indexOf(`\n${fence}`, lineEnd);
      const end = closeAt === -1 ? text.length : (text.indexOf('\n', closeAt + 1) === -1 ? text.length : text.indexOf('\n', closeAt + 1));
      flush();
      out += text.slice(i, end);
      i = end;
      continue;
    }

    const ch = text[i];

    if (mode !== 'plain' && ch === '`') {
      const run = text.slice(i).match(/^`+/)![0];
      const close = text.indexOf(run, i + run.length);
      const newline = text.indexOf('\n', i);
      if (close !== -1 && (newline === -1 || close < newline)) {
        const code = text.slice(i + run.length, close).trim();
        flush();
        out += tokens.add(`<code>${escapeHtml(code)}</code>`);
        i = close + run.length;
        continue;
      }
      buffer += run;
      i += run.length;
      continue;
    }

    if (ch === '\\') {
      // Over-escaped delimiters ("\\(x\\)") are a common model mistake; accept them too.
      const opener = text.slice(i).match(/^\\{1,2}([([])/);
      if (opener) {
        const closer = opener[1] === '(' ? '\\)' : '\\]';
        const bodyStart = i + opener[0].length;
        const close = text.indexOf(closer, bodyStart);
        if (close !== -1) {
          const bodyEnd = text[close - 1] === '\\' && close - 1 >= bodyStart ? close - 1 : close;
          emitMath(text.slice(bodyStart, bodyEnd), opener[1] === '[');
          i = close + 2;
          continue;
        }
        // Unclosed (usually a truncated string): drop the delimiter, keep the content as text.
        i += opener[0].length;
        continue;
      }
      // A stray closer with no opener.
      if (/^\\{1,2}[)\]]/.test(text.slice(i))) {
        i += text[i + 1] === '\\' ? 3 : 2;
        continue;
      }
      if (text[i + 1] === '$') {
        buffer += tokens.add('$');
        i += 2;
        continue;
      }
      if (mode !== 'plain' && /[*_#`~|>]/.test(text[i + 1] ?? '')) {
        buffer += tokens.add(escapeHtml(text[i + 1]));
        i += 2;
        continue;
      }
      const env = text.slice(i).match(new RegExp(`^\\\\begin\\{(${MATH_ENVIRONMENTS})\\}`));
      if (env) {
        const endTag = `\\end{${env[1]}}`;
        const close = text.indexOf(endTag, i + env[0].length);
        if (close !== -1) {
          emitMath(text.slice(i, close + endTag.length), true);
          i = close + endTag.length;
          continue;
        }
      }
    }

    if (ch === '$' && !isEscaped(text, i)) {
      if (text[i + 1] === '$') {
        const close = findUnescaped(text, '$$', i + 2);
        if (close !== -1 && text.slice(i + 2, close).trim()) {
          emitMath(text.slice(i + 2, close), true);
          i = close + 2;
          continue;
        }
        buffer += '$$';
        i += 2;
        continue;
      }
      const close = findClosingDollar(text, i + 1);
      if (close !== -1) {
        emitMath(text.slice(i + 1, close), false);
        i = close + 1;
        continue;
      }
    }

    buffer += ch;
    i += 1;
  }

  flush();
  return out;
}

// ─── Inline formatting ─────────────────────────────────────────────────────────────────

// x^2, x^{n+1}, x^(n+1), 10^-3 — a bare exponent is one signed number or one letter, so
// "x^2+3x" is x² + 3x, not x^(2+3x).
const PLAIN_SUPERSCRIPT = /([A-Za-z0-9)\]])\^(?:\{([^{}]+)\}|\(([^()]+)\)|([+-]?\d+(?:\.\d+)?|[+-]?[A-Za-z](?![A-Za-z])))/g;
// Only the braced form: a bare underscore is far more often snake_case than a subscript.
const PLAIN_SUBSCRIPT = /([A-Za-z0-9)\]])_\{([^{}]+)\}/g;

function applyPlainScripts(html: string): string {
  return html
    .replace(PLAIN_SUPERSCRIPT, (_m, base: string, brace?: string, paren?: string, bare?: string) =>
      `${base}<sup>${brace ?? paren ?? bare ?? ''}</sup>`)
    .replace(PLAIN_SUBSCRIPT, (_m, base: string, sub: string) => `${base}<sub>${sub}</sub>`);
}

function applyInline(text: string, tokens: Tokens): string {
  // Links first, so nothing below rewrites inside a URL. Only http(s) is ever a link.
  const linked = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label: string, url: string) =>
    tokens.add(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`),
  );

  const html = applyPlainScripts(escapeHtml(linked))
    .replace(/\*\*(?!\s)(.+?)(?<!\s)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__(?!\s)(.+?)(?<!\s)__(?!\w)/g, '$1<strong>$2</strong>')
    .replace(/~~(?!\s)(.+?)(?<!\s)~~/g, '<del>$1</del>')
    .replace(/(^|[\s([>"'\uE001])\*(?![\s*])(.+?)(?<![\s*])\*(?=$|[\s).,!?:;\]<"'\uE000])/g, '$1<em>$2</em>')
    .replace(/(^|[\s([>"'\uE001])_(?![\s_])(.+?)(?<![\s_])_(?=$|[\s).,!?:;\]<"'\uE000])/g, '$1<em>$2</em>');

  return tokens.restore(html);
}

// ─── Blocks ────────────────────────────────────────────────────────────────────────────

const TABLE_SEPARATOR_ROW = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const HORIZONTAL_RULE = /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/;

function parseTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

function buildTable(header: string, separator: string, rows: string[], tokens: Tokens): string {
  const alignments = parseTableRow(separator).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return left ? 'left' : null;
  });
  const style = (i: number) => (alignments[i] ? ` style="text-align:${alignments[i]}"` : '');
  const headerCells = parseTableRow(header);
  const width = headerCells.length;
  const cells = (row: string) => {
    const parsed = parseTableRow(row).slice(0, width);
    while (parsed.length < width) parsed.push('');
    return parsed;
  };

  const thead = `<thead><tr>${headerCells.map((cell, i) => `<th${style(i)}>${applyInline(cell, tokens)}</th>`).join('')}</tr></thead>`;
  const tbody = rows.length
    ? `<tbody>${rows.map((row) => `<tr>${cells(row).map((cell, i) => `<td${style(i)}>${applyInline(cell, tokens)}</td>`).join('')}</tr>`).join('')}</tbody>`
    : '';
  return `<div class="markdown-table-wrapper"><table>${thead}${tbody}</table></div>`;
}

type OpenList = { type: 'ul' | 'ol'; indent: number };

function indentOf(line: string): number {
  return (line.match(/^\s*/)?.[0] ?? '').replace(/\t/g, '    ').length;
}

function markdownBlocks(text: string, tokens: Tokens): string {
  const lines = text.split('\n');
  const html: string[] = [];
  const lists: OpenList[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];
  let blankInList = false;

  const inline = (value: string) => applyInline(value, tokens);
  const closeParagraph = () => {
    if (paragraph.length) html.push(`<p>${paragraph.map(inline).join('<br />')}</p>`);
    paragraph = [];
  };
  const closeQuote = () => {
    if (quote.length) html.push(`<blockquote><p>${quote.map(inline).join('<br />')}</p></blockquote>`);
    quote = [];
  };
  const closeListsTo = (depth: number) => {
    while (lists.length > depth) html.push(`</li></${lists.pop()!.type}>`);
  };
  const closeAll = () => {
    closeParagraph();
    closeQuote();
    closeListsTo(0);
    blankInList = false;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    const fence = line.match(/^ {0,3}(```|~~~)\s*([^\s`]*)/);
    if (fence) {
      closeAll();
      const code: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].trimStart().startsWith(fence[1])) code.push(lines[j++]);
      const language = fence[2] ? ` class="language-${escapeHtml(fence[2])}"` : '';
      // Code is shown as written: placeholders inside it can only be escaped `\$` and the like.
      html.push(`<pre><code${language}>${tokens.restore(escapeHtml(code.join('\n')))}</code></pre>`);
      i = j;
      continue;
    }

    if (!trimmed) {
      closeParagraph();
      closeQuote();
      if (lists.length) blankInList = true;
      continue;
    }

    const item = line.match(LIST_ITEM);
    const indent = indentOf(line);

    // A list survives blank lines between its items ("1. a\n\n2. b" used to restart at 1),
    // and an indented line after an item continues that item.
    if (lists.length && !item) {
      if (indent >= lists[lists.length - 1].indent + 2) {
        html.push(blankInList ? `<br /><br />${inline(trimmed)}` : `<br />${inline(trimmed)}`);
        blankInList = false;
        continue;
      }
      closeListsTo(0);
    }
    blankInList = false;

    if (HORIZONTAL_RULE.test(line)) {
      closeAll();
      html.push('<hr />');
      continue;
    }

    const next = lines[i + 1];
    if (trimmed.includes('|') && next !== undefined && next.includes('|') && TABLE_SEPARATOR_ROW.test(next)) {
      closeAll();
      const rows: string[] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim() && lines[j].includes('|')) rows.push(lines[j++]);
      html.push(buildTable(line, next, rows, tokens));
      i = j - 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
    if (heading) {
      closeAll();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const quoted = line.match(/^\s*>\s?(.*)$/);
    if (quoted) {
      closeParagraph();
      closeListsTo(0);
      quote.push(quoted[1]);
      continue;
    }

    if (item) {
      closeParagraph();
      closeQuote();
      const type: OpenList['type'] = /\d/.test(item[2]) ? 'ol' : 'ul';
      while (lists.length && indent < lists[lists.length - 1].indent) closeListsTo(lists.length - 1);
      const top = lists[lists.length - 1];
      if (top && indent < top.indent + 2 && top.type !== type) closeListsTo(lists.length - 1);

      const current = lists[lists.length - 1];
      if (current && indent < current.indent + 2) {
        html.push(`</li><li>${inline(item[3])}`);
      } else {
        const start = type === 'ol' ? parseInt(item[2], 10) : 1;
        html.push(`<${type}${type === 'ol' && start !== 1 ? ` start="${start}"` : ''}><li>${inline(item[3])}`);
        lists.push({ type, indent });
      }
      continue;
    }

    closeQuote();
    paragraph.push(trimmed);
  }

  closeAll();
  return html.join('\n');
}

// ─── Entry point ───────────────────────────────────────────────────────────────────────

export function renderRichText(content: string | null | undefined, mode: RichTextMode = 'markdown'): string {
  if (!content) return '';
  const tokens = new Tokens();
  const source = normalizeSource(content);

  if (mode === 'plain') {
    const text = tokenize(source, mode, tokens);
    return tokens.restore(applyPlainScripts(escapeHtml(text)).replace(/\n/g, '<br />'));
  }

  if (mode === 'inline') {
    return applyInline(tokenize(source, mode, tokens).replace(/\s*\n\s*/g, ' ').trim(), tokens);
  }

  return markdownBlocks(tokenize(source, mode, tokens), tokens);
}
