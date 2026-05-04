const LATEX_COMMAND_NAMES = [
  'alpha',
  'beta',
  'binom',
  'bmatrix',
  'cdot',
  'choose',
  'Delta',
  'det',
  'dfrac',
  'dots',
  'end',
  'frac',
  'Gamma',
  'gamma',
  'geq',
  'infty',
  'int',
  'lambda',
  'left',
  'leq',
  'lim',
  'ln',
  'log',
  'matrix',
  'mathbf',
  'mathrm',
  'mu',
  'nabla',
  'neq',
  'omega',
  'overline',
  'pi',
  'pmatrix',
  'prod',
  'rightarrow',
  'right',
  'sigma',
  'sin',
  'sqrt',
  'sum',
  'tan',
  'tau',
  'text',
  'tfrac',
  'theta',
  'times',
  'to',
  'underline',
  'vec',
] as const;

export const LATEX_COMMAND_PATTERN = `(?:${LATEX_COMMAND_NAMES.join('|')})`;

export function normalizeLatexControlCharacters(value: string): string {
  return value
    .replace(/\u0008(?=(?:egin|eta|inom|matrix)\b)/g, () => '\\b')
    .replace(/\u000c(?=rac\b)/g, () => '\\f')
    .replace(/\t(?=(?:an|au|ext|frac|heta|imes|o)\b)/g, () => '\\t')
    .replace(/\r(?=(?:angle|ho|ight|ightarrow)\b)/g, () => '\\r')
    .replace(/\n(?=(?:abla|eq)\b)/g, () => '\\n');
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

function findNextMathDelimiter(value: string, start: number): number {
  let next = -1;
  const candidates = ['$$', '\\[', '\\(', '$'];

  for (const candidate of candidates) {
    const index = value.indexOf(candidate, start);
    if (index !== -1 && (next === -1 || index < next)) {
      next = index;
    }
  }

  return next;
}

function consumeExistingMathSegment(value: string, index: number): number {
  if (value.startsWith('$$', index) && !isEscaped(value, index)) {
    const end = value.indexOf('$$', index + 2);
    return end === -1 ? -1 : end + 2;
  }

  if (value.startsWith('\\[', index)) {
    const end = value.indexOf('\\]', index + 2);
    return end === -1 ? -1 : end + 2;
  }

  if (value.startsWith('\\(', index)) {
    const end = value.indexOf('\\)', index + 2);
    return end === -1 ? -1 : end + 2;
  }

  if (value[index] === '$' && value[index + 1] !== '$' && !isEscaped(value, index)) {
    const end = findClosingSingleDollar(value, index + 1);
    return end === -1 ? -1 : end + 1;
  }

  return -1;
}

function wrapBareLatexInPlainText(value: string): string {
  const mathToken = String.raw`(?:\\[A-Za-z]+|\d+(?:\.\d+)?|[A-Za-z](?![A-Za-z])|[{}()[\]^_+\-*/=|<>,])`;
  const bareLatexPattern = new RegExp(
    `\\\\${LATEX_COMMAND_PATTERN}\\b(?:[ \\t]*${mathToken})*`,
    'g',
  );

  return value.replace(bareLatexPattern, (match: string) => {
    const leading = match.match(/^\s*/)?.[0] ?? '';
    const trailing = match.match(/\s*$/)?.[0] ?? '';
    const expression = match.trim();

    if (!expression || !/[{}^_=+\-*/]/.test(expression) || /^\\(?:to|dots)$/.test(expression)) {
      return match;
    }

    return `${leading}\\(${expression}\\)${trailing}`;
  });
}

export function wrapBareLatexExpressions(value: string): string {
  let result = '';
  let index = 0;

  while (index < value.length) {
    const existingMathEnd = consumeExistingMathSegment(value, index);
    if (existingMathEnd !== -1) {
      result += value.slice(index, existingMathEnd);
      index = existingMathEnd;
      continue;
    }

    const nextMathStart = findNextMathDelimiter(value, index);
    const chunkEnd = nextMathStart === -1 ? value.length : nextMathStart;
    if (chunkEnd === index) {
      result += value[index];
      index += 1;
      continue;
    }

    result += wrapBareLatexInPlainText(value.slice(index, chunkEnd));
    index = chunkEnd;
  }

  return result;
}
