'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import renderMathInElement from 'katex/contrib/auto-render';
import { normalizeLatexControlCharacters, wrapBareLatexExpressions } from '@/lib/mathText';

type MathContentProps = {
  content: string;
  className?: string;
  isHtml?: boolean;
  inline?: boolean;
};

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyPlainTextSuperscripts(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];

  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    if (!parent) {
      node = walker.nextNode();
      continue;
    }

    const shouldSkip =
      parent.closest('.katex') ||
      parent.closest('code') ||
      parent.closest('pre') ||
      parent.closest('script') ||
      parent.closest('style') ||
      parent.closest('textarea');

    if (!shouldSkip && textNode.nodeValue && textNode.nodeValue.includes('^')) {
      targets.push(textNode);
    }

    node = walker.nextNode();
  }

  // base^exp, base^(exp), base^{exp}
  const exponentRegex = /([A-Za-z0-9)\]])\^(?:\{([^}]+)\}|\(([^)]+)\)|([A-Za-z0-9+\-]+))/g;

  for (const textNode of targets) {
    const text = textNode.nodeValue || '';
    let match: RegExpExecArray | null;
    let cursor = 0;
    let hasMatch = false;
    const fragment = document.createDocumentFragment();

    while ((match = exponentRegex.exec(text)) !== null) {
      hasMatch = true;
      const [fullMatch, base, braceExp, parenExp, bareExp] = match;
      const exponent = braceExp ?? parenExp ?? bareExp ?? '';
      const matchIndex = match.index;

      fragment.append(document.createTextNode(text.slice(cursor, matchIndex)));
      fragment.append(document.createTextNode(base));

      const sup = document.createElement('sup');
      sup.textContent = exponent;
      fragment.append(sup);

      cursor = matchIndex + fullMatch.length;
    }

    if (!hasMatch) continue;

    fragment.append(document.createTextNode(text.slice(cursor)));
    textNode.parentNode?.replaceChild(fragment, textNode);
  }
}

function normalizeMathTextNodes(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];

  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    if (!parent) {
      node = walker.nextNode();
      continue;
    }

    const shouldSkip =
      parent.closest('.katex') ||
      parent.closest('code') ||
      parent.closest('pre') ||
      parent.closest('script') ||
      parent.closest('style') ||
      parent.closest('textarea');

    if (!shouldSkip && textNode.nodeValue) {
      targets.push(textNode);
    }

    node = walker.nextNode();
  }

  for (const textNode of targets) {
    const current = textNode.nodeValue || '';
    const normalized = wrapBareLatexExpressions(normalizeLatexControlCharacters(current));
    if (normalized !== current) {
      textNode.nodeValue = normalized;
    }
  }
}

export function MathContent({
  content,
  className,
  isHtml = false,
  inline = false,
}: MathContentProps) {
  const ref = useRef<HTMLElement | null>(null);
  const setRef = (node: HTMLElement | null) => {
    ref.current = node;
  };

  const html = useMemo(() => {
    if (isHtml) return content || '';
    return escapeHtml(content || '').replace(/\n/g, '<br />');
  }, [content, isHtml]);

  const markup = useMemo(() => ({ __html: html }), [html]);

  useBrowserLayoutEffect(() => {
    if (!ref.current) return;

    normalizeMathTextNodes(ref.current);

    renderMathInElement(ref.current, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
      strict: 'ignore',
    });

    // Also support plain caret notation like x^2 outside math delimiters.
    applyPlainTextSuperscripts(ref.current);
  });

  if (inline) {
    return (
      <span
        ref={setRef}
        className={className}
        dangerouslySetInnerHTML={markup}
      />
    );
  }

  return (
    <div
      ref={setRef}
      className={className}
      dangerouslySetInnerHTML={markup}
    />
  );
}
