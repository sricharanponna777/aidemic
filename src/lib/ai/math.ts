import { SupportedSubject } from '@/lib/ai/validation';

const MATH_SUBJECTS: SupportedSubject[] = [
  'mathematics',
  'physics',
  'chemistry',
  'computer science',
  'combined science (physics)',
  'combined science (chemistry)',
];

// Runs on text that has already been through it (generation stores normalised text, and
// mark-answers / review-queue normalise it again), so every rule must be idempotent. A word is
// only rewritten when no backslash or letter precedes it — `\bpi\b` used to match the "pi" of
// "\pi", producing "\\pi" (a line break followed by the letters "pi").
//
// There is deliberately no rule for bare `e` or `i`: rewriting them to \mathrm{} turned the
// index in \sum_{i=1} upright, broke `\text{e.g.}` (\mathrm is not allowed in text mode), and
// nested itself on every pass.
export const normalizeMathExpression = (expression: string) => {
  let next = expression;

  next = next.replace(/\(\s*([^()]+?)\s*\)\s*\/\s*\(\s*([^()]+?)\s*\)/g, '\\frac{$1}{$2}');
  next = next.replace(/([A-Za-z0-9)\]])\^([+-]?[A-Za-z0-9]+)/g, '$1^{$2}');
  next = next.replace(/([A-Za-z0-9)\]])_([A-Za-z0-9]+)/g, '$1_{$2}');
  next = next.replace(/(?<![\\A-Za-z])sqrt\s*\(\s*([^()]+?)\s*\)/g, '\\sqrt{$1}');
  next = next.replace(/(?<![\\A-Za-z])pi(?![A-Za-z])/g, '\\pi');
  next = next.replace(/(?<![\\A-Za-z])inf(?![A-Za-z])/g, '\\infty');

  return next;
};

export const normalizeMathNotation = (text: string, subject: SupportedSubject | string | null) => {
  if (!MATH_SUBJECTS.includes(subject as SupportedSubject)) return text;

  let hasMathDelimiters = false;
  let next = text;

  next = next.replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression: string) => {
    hasMathDelimiters = true;
    return `\\(${normalizeMathExpression(expression)}\\)`;
  });

  next = next.replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression: string) => {
    hasMathDelimiters = true;
    return `\\[${normalizeMathExpression(expression)}\\]`;
  });

  next = next.replace(/\$\$([\s\S]*?)\$\$/g, (_match, expression: string) => {
    hasMathDelimiters = true;
    return `$$${normalizeMathExpression(expression)}$$`;
  });

  next = next.replace(/\$([^$\n]+)\$/g, (_match, expression: string) => {
    hasMathDelimiters = true;
    return `$${normalizeMathExpression(expression)}$`;
  });

  return hasMathDelimiters ? next : text;
};
