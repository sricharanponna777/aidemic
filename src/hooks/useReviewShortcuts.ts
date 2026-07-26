import { useEffect } from 'react';

/** True when the user is typing, so review shortcuts must not hijack the key. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Anki/Quizlet-style keyboard control for a flashcard review surface.
 *
 * - Space / Enter reveals the answer, and once revealed grades "Good"
 * - 1-4 grade Again / Hard / Good / Easy (only once the answer is showing)
 *
 * Disabled while a text field has focus, and while `enabled` is false.
 */
export function useReviewShortcuts({
  enabled,
  isAnswerShown,
  onReveal,
  onGrade,
}: {
  enabled: boolean;
  isAnswerShown: boolean;
  onReveal: () => void;
  onGrade: (quality: number) => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (isAnswerShown) onGrade(2);
        else onReveal();
        return;
      }

      if (!isAnswerShown) return;

      const quality = { '1': 0, '2': 1, '3': 2, '4': 3 }[event.key];
      if (quality !== undefined) {
        event.preventDefault();
        onGrade(quality);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, isAnswerShown, onReveal, onGrade]);
}

/** Shared labels/tones for the four SM-2 grades, so the review surfaces and
 *  any future review UI stay consistent. Index === quality. */
export const REVIEW_GRADES = [
  { quality: 0, label: 'Again', key: '1', tone: 'bg-danger text-white' },
  { quality: 1, label: 'Hard', key: '2', tone: 'bg-warning text-white' },
  { quality: 2, label: 'Good', key: '3', tone: 'bg-accent text-accent-fg' },
  { quality: 3, label: 'Easy', key: '4', tone: 'bg-success text-white' },
] as const;
