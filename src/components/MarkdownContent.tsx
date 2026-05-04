'use client';

import { useMemo } from 'react';
import { MathContent } from '@/components/MathContent';
import { normalizeLatexControlCharacters, wrapBareLatexExpressions } from '@/lib/mathText';

type MarkdownContentProps = {
  content: string;
  className?: string;
  inline?: boolean;
};

type ListType = 'ul' | 'ol';
type MathTokenState = {
  segments: string[];
};
const MATRIX_ENVIRONMENT = '((?:p|b|B|v|V)?matrix)';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function normalizeEducationalMarkup(value: string): string {
  let next = normalizeLatexControlCharacters(value)
    .replace(/([A-Za-z0-9)\]])\s*<sub>([\s\S]*?)<\/sub>/gi, (_match, base: string, sub: string) => {
      const cleanSub = stripTags(sub);
      return cleanSub ? `$${base}_{${cleanSub}}$` : base;
    })
    .replace(/([A-Za-z0-9)\]])\s*<sup>([\s\S]*?)<\/sup>/gi, (_match, base: string, sup: string) => {
      const cleanSup = stripTags(sup);
      return cleanSup ? `$${base}^{${cleanSup}}$` : base;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '');

  next = normalizeLatexMatrices(next);
  next = wrapBareMatrixFormulaLines(next);
  next = normalizeTextInverseNotation(next);
  next = wrapBareLatexExpressions(next);
  return next;
}

function normalizeMathInverseNotation(value: string): string {
  return value
    .replace(/\b([A-Z])-1\b/g, '$1^{-1}')
    .replace(/\b([A-Z])\^-1\b/g, '$1^{-1}');
}

function normalizeLatexMathSegment(value: string): string {
  return normalizeMathInverseNotation(value).replace(/\\text\{det\}/g, '\\det');
}

function normalizeTextInverseNotation(value: string): string {
  return value
    .split('\n')
    .map((line) => {
      if (/(?:\\\[|\\\(|\$\$|\$|\\begin\{)/.test(line)) return line;
      return line
        .replace(/\b([A-Z])-1\b/g, '$$$1^{-1}$')
        .replace(/\b([A-Z])\^-1\b/g, '$$$1^{-1}$');
    })
    .join('\n');
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

function wrapBareMatrixFormulaLines(value: string): string {
  const containsMatrix = new RegExp(`\\\\begin\\{${MATRIX_ENVIRONMENT}\\}`);

  return value
    .split('\n')
    .flatMap((line) => {
      if (!containsMatrix.test(line) || /^\s*(?:\\\[|\$\$|\$|\\\()/.test(line)) return [line];

      const indent = line.match(/^\s*/)?.[0] ?? '';
      const trimmed = line.trim();
      const ifMatch = trimmed.match(/^If\s+(.+)$/i);
      const expression = normalizeMathInverseNotation(ifMatch ? ifMatch[1] : trimmed);

      if (!/[=&]|\\frac|\\det|\\text\{det\}/.test(expression)) return [line];

      const displayLine = `${indent}\\[ ${expression.replace(/\\text\{det\}/g, '\\det')} \\]`;
      return ifMatch ? [`${indent}If`, displayLine] : [displayLine];
    })
    .join('\n');
}

function isEscaped(value: string, index: number): boolean {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && value[i] === '\\'; i -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function findClosingSingleDollar(value: string, start: number): number {
  for (let i = start; i < value.length; i += 1) {
    if (value[i] === '\n') return -1;
    if (value[i] === '$' && !isEscaped(value, i) && value[i + 1] !== '$') return i;
  }
  return -1;
}

function protectMathSegments(markdown: string): { text: string; state: MathTokenState } {
  const segments: string[] = [];
  let text = '';
  let index = 0;

  const addSegment = (segment: string) => {
    const token = `@@MATH${segments.length}@@`;
    segments.push(escapeHtml(normalizeLatexMathSegment(segment)));
    text += token;
  };

  while (index < markdown.length) {
    if (markdown.startsWith('$$', index) && !isEscaped(markdown, index)) {
      const end = markdown.indexOf('$$', index + 2);
      if (end !== -1) {
        addSegment(markdown.slice(index, end + 2));
        index = end + 2;
        continue;
      }
    }

    if (markdown.startsWith('\\[', index)) {
      const end = markdown.indexOf('\\]', index + 2);
      if (end !== -1) {
        addSegment(markdown.slice(index, end + 2));
        index = end + 2;
        continue;
      }
    }

    if (markdown.startsWith('\\(', index)) {
      const end = markdown.indexOf('\\)', index + 2);
      if (end !== -1) {
        addSegment(markdown.slice(index, end + 2));
        index = end + 2;
        continue;
      }
    }

    if (markdown[index] === '$' && markdown[index + 1] !== '$' && !isEscaped(markdown, index)) {
      const end = findClosingSingleDollar(markdown, index + 1);
      if (end !== -1) {
        addSegment(markdown.slice(index, end + 1));
        index = end + 1;
        continue;
      }
    }

    text += markdown[index];
    index += 1;
  }

  return { text, state: { segments } };
}

function restoreMathTokens(html: string, state: MathTokenState): string {
  return html.replace(/@@MATH(\d+)@@/g, (match, index: string) => state.segments[Number(index)] ?? match);
}

function applyInlineMarkdown(value: string, state: MathTokenState): string {
  const codeSpans: string[] = [];
  let html = escapeHtml(value);

  html = html.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    const token = `%%CODE_SPAN_${codeSpans.length}%%`;
    codeSpans.push(`<code>${code}</code>`);
    return token;
  });

  html = html
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s([])\*([^\s*][^*\n]*?[^\s*]|\S)\*(?=$|[\s).,!?:;\]])/g, '$1<em>$2</em>')
    .replace(/(^|[\s([])_([^\s_][^_\n]*?[^\s_]|\S)_(?=$|[\s).,!?:;\]])/g, '$1<em>$2</em>');

  codeSpans.forEach((span, index) => {
    html = html.replace(`%%CODE_SPAN_${index}%%`, span);
  });

  return restoreMathTokens(html, state);
}

function markdownToInlineHtml(markdown: string): string {
  const normalized = normalizeEducationalMarkup(markdown);
  const { text, state } = protectMathSegments(normalized.replace(/\r\n/g, '\n').replace(/\n+/g, ' '));
  return applyInlineMarkdown(text, state);
}

function markdownToHtml(markdown: string): string {
  const normalized = normalizeEducationalMarkup(markdown);
  const protectedMarkdown = protectMathSegments(normalized.replace(/\r\n/g, '\n'));
  const lines = protectedMarkdown.text.split('\n');
  const { state } = protectedMarkdown;
  const html: string[] = [];
  let openList: ListType | null = null;
  let paragraphLines: string[] = [];
  let quoteLines: string[] = [];
  let inCodeBlock = false;
  let codeLanguage = '';
  let codeLines: string[] = [];

  const closeList = () => {
    if (!openList) return;
    html.push(`</${openList}>`);
    openList = null;
  };

  const closeParagraph = () => {
    if (paragraphLines.length === 0) return;
    html.push(`<p>${paragraphLines.map((line) => applyInlineMarkdown(line, state)).join('<br />')}</p>`);
    paragraphLines = [];
  };

  const closeQuote = () => {
    if (quoteLines.length === 0) return;
    html.push(`<blockquote><p>${quoteLines.map((line) => applyInlineMarkdown(line, state)).join('<br />')}</p></blockquote>`);
    quoteLines = [];
  };

  const closeCodeBlock = () => {
    const languageClass = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : '';
    const codeHtml = restoreMathTokens(escapeHtml(codeLines.join('\n')), state);
    html.push(`<pre><code${languageClass}>${codeHtml}</code></pre>`);
    inCodeBlock = false;
    codeLanguage = '';
    codeLines = [];
  };

  const openNewList = (type: ListType) => {
    if (openList === type) return;
    closeList();
    html.push(`<${type}>`);
    openList = type;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const fence = trimmed.match(/^```([^\s`]*)?.*$/);

    if (fence) {
      if (inCodeBlock) {
        closeCodeBlock();
      } else {
        closeParagraph();
        closeQuote();
        closeList();
        inCodeBlock = true;
        codeLanguage = fence[1] || '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      closeParagraph();
      closeQuote();
      closeList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeParagraph();
      closeQuote();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${applyInlineMarkdown(heading[2], state)}</h${level}>`);
      continue;
    }

    const quote = line.match(/^\s*>\s?(.+)$/);
    if (quote) {
      closeParagraph();
      closeList();
      quoteLines.push(quote[1]);
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      closeParagraph();
      closeQuote();
      openNewList('ul');
      html.push(`<li>${applyInlineMarkdown(unordered[1], state)}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      closeParagraph();
      closeQuote();
      openNewList('ol');
      html.push(`<li>${applyInlineMarkdown(ordered[1], state)}</li>`);
      continue;
    }

    closeQuote();
    closeList();
    paragraphLines.push(trimmed);
  }

  if (inCodeBlock) closeCodeBlock();
  closeParagraph();
  closeQuote();
  closeList();

  return html.join('\n');
}

export function MarkdownContent({ content, className, inline = false }: MarkdownContentProps) {
  const html = useMemo(
    () => (inline ? markdownToInlineHtml(content || '') : markdownToHtml(content || '')),
    [content, inline]
  );
  const contentClassName = ['markdown-content', className].filter(Boolean).join(' ');

  return <MathContent className={contentClassName} content={html} isHtml inline={inline} />;
}
