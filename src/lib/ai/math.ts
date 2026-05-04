import { SupportedSubject } from '@/lib/ai/validation';

const MATH_SUBJECTS: SupportedSubject[] = ['mathematics', 'physics', 'chemistry', 'computer science'];

export const normalizeMathExpression = (expression: string) => {
  let next = expression;

  next = next.replace(/\(\s*([^()]+?)\s*\)\s*\/\s*\(\s*([^()]+?)\s*\)/g, '\\frac{$1}{$2}');
  next = next.replace(/([A-Za-z0-9)\]])\^([A-Za-z0-9+\-]+)/g, '$1^{$2}');
  next = next.replace(/([A-Za-z0-9)\]])_([A-Za-z0-9+\-]+)/g, '$1_{$2}');
  next = next.replace(/sqrt\s*\(\s*([^()]+?)\s*\)/g, '\\sqrt{$1}');
  next = next.replace(/\bpi\b/g, '\\pi');
  next = next.replace(/\be\b/g, '\\mathrm{e}');
  next = next.replace(/\bi\b/g, '\\mathrm{i}');
  next = next.replace(/\binf\b/g, '\\infty');

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
