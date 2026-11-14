'use client';

import { useMemo } from 'react';
import { renderRichText } from '@/lib/richText';

type MarkdownContentProps = {
  content: string | null | undefined;
  className?: string;
  inline?: boolean;
};

/** AI- or teacher-authored study text: markdown with LaTeX maths. See src/lib/richText.ts. */
export function MarkdownContent({ content, className, inline = false }: MarkdownContentProps) {
  const markup = useMemo(() => ({ __html: renderRichText(content, inline ? 'inline' : 'markdown') }), [content, inline]);
  const contentClassName = ['markdown-content', className].filter(Boolean).join(' ');

  return inline
    ? <span className={contentClassName} dangerouslySetInnerHTML={markup} />
    : <div className={contentClassName} dangerouslySetInnerHTML={markup} />;
}
