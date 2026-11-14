'use client';

import { useMemo } from 'react';
import { renderRichText } from '@/lib/richText';

type MathContentProps = {
  content: string | null | undefined;
  className?: string;
  inline?: boolean;
};

/**
 * Text a student typed or wrote by hand: maths and line breaks are rendered, markdown is not,
 * so "2 * x * 3" stays exactly as entered. For AI- or teacher-authored text use MarkdownContent.
 */
export function MathContent({ content, className, inline = false }: MathContentProps) {
  const markup = useMemo(() => ({ __html: renderRichText(content, 'plain') }), [content]);

  return inline
    ? <span className={className} dangerouslySetInnerHTML={markup} />
    : <div className={className} dangerouslySetInnerHTML={markup} />;
}
