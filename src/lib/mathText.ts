// LaTeX commands we recognise when they appear *without* math delimiters, so
// bare `\frac{1}{2}` or `\pi r^{2}` in prose can still be rendered as maths.
const LATEX_COMMAND_NAMES = [
  // Greek
  'alpha', 'beta', 'gamma', 'Gamma', 'delta', 'Delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta',
  'Theta', 'vartheta', 'iota', 'kappa', 'lambda', 'Lambda', 'mu', 'nu', 'xi', 'Xi', 'pi', 'Pi', 'rho',
  'sigma', 'Sigma', 'tau', 'upsilon', 'phi', 'Phi', 'varphi', 'chi', 'psi', 'Psi', 'omega', 'Omega',
  // Structures
  'frac', 'dfrac', 'tfrac', 'sqrt', 'binom', 'choose', 'overline', 'underline', 'vec', 'hat', 'bar',
  'dot', 'ddot', 'tilde', 'overrightarrow', 'boxed', 'left', 'right', 'begin', 'end', 'text', 'textbf',
  'mathrm', 'mathbf', 'mathit', 'mathbb', 'operatorname', 'ce',
  // Matrices
  'matrix', 'pmatrix', 'bmatrix',
  // Operators and functions
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'exp', 'lim', 'max', 'min', 'det', 'sum', 'prod', 'int', 'iint', 'oint', 'partial', 'nabla',
  // Relations and symbols
  'cdot', 'times', 'div', 'pm', 'mp', 'leq', 'geq', 'le', 'ge', 'neq', 'approx', 'equiv', 'sim', 'propto',
  'infty', 'degree', 'circ', 'angle', 'triangle', 'perp', 'parallel', 'therefore', 'because', 'in',
  'notin', 'subset', 'subseteq', 'cup', 'cap', 'emptyset', 'forall', 'exists', 'to', 'rightarrow',
  'leftarrow', 'Rightarrow', 'Leftarrow', 'leftrightarrow', 'Leftrightarrow', 'longrightarrow',
  'rightleftharpoons', 'dots', 'ldots', 'cdots', 'quad', 'qquad',
] as const;

export const LATEX_COMMAND_PATTERN = `(?:${[...LATEX_COMMAND_NAMES].sort((a, b) => b.length - a.length).join('|')})`;

// A JSON string written as "\frac" parses to a form feed followed by "rac", "\theta" to a tab
// followed by "heta", and so on. These put the backslash back.
//
// \b and \f are never wanted in study text, so any backspace or form feed directly before a letter
// is restored. Tab, carriage return and newline are real characters, so they are only restored
// before the rest of a command name — and a few are deliberately missing: a newline followed by
// "u = 5" (SUVAT) or "i.e." is far likelier than \nu or \ni.
const TAB_COMMAND_TAILS = 'an|anh|au|ext|extbf|extit|extrm|frac|heta|herefore|ilde|imes|o|op|riangle';
const CR_COMMAND_TAILS = 'angle|ho|ight|ightarrow|ightleftharpoons|floor|ceil';
const NEWLINE_COMMAND_TAILS = 'abla|eq|eg|ewline|otin|parallel|mid|exists|leftarrow|rightarrow|subseteq|cong';

export function normalizeLatexControlCharacters(value: string): string {
  return value
    .replace(/\u0008(?=[A-Za-z])/g, () => '\\b')
    .replace(/\u000c(?=[A-Za-z])/g, () => '\\f')
    .replace(new RegExp(`\\t(?=(?:${TAB_COMMAND_TAILS})(?![A-Za-z]))`, 'g'), () => '\\t')
    .replace(new RegExp(`\\r(?=(?:${CR_COMMAND_TAILS})(?![A-Za-z]))`, 'g'), () => '\\r')
    .replace(new RegExp(`\\n(?=(?:${NEWLINE_COMMAND_TAILS})(?![A-Za-z]))`, 'g'), () => '\\n');
}

// Fixes copy-paste artifact where \frac{A}{B} appears as stacked lines "A\nB\nB\nA"
function fixStackedFractions(expr: string): string {
  return expr.replace(
    /(=\s*)\n([A-Za-z]\w*)\n([A-Za-z]\w*)\n(?:\3\n\2\n)?[​ ]*/g,
    (_m, eq, num, den) => `${eq}\\frac{${num}}{${den}}`,
  );
}

// Converts \begin{equation}...\end{equation} (and broken variants) to $$ delimiters.
export function normalizeEquationEnvironments(value: string): string {
  // Fix broken \(\end{\)envname} → \end{envname}
  let next = value.replace(/\\\(\\end\{\\\)([A-Za-z*]+)\}/g, '\\end{$1}');

  // \begin{equation[*]}...\end{equation[*]} → $$...$$
  next = next.replace(
    /\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g,
    (_m, body) => `$$${fixStackedFractions(body).trim()}$$`,
  );

  // \begin{align[*]}...\end{align[*]} → $$\begin{aligned}...\end{aligned}$$
  next = next.replace(
    /\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/g,
    (_m, body) => `$$\\begin{aligned}${body}\\end{aligned}$$`,
  );

  return next;
}

// Single-escaped LaTeX in a model's JSON ("\sqrt{2}") is an invalid escape and fails JSON.parse
// outright. Used only after a plain parse has failed: doubles the backslash in front of a known
// command, then any backslash that still isn't a valid JSON escape. The ambiguous \n and \t
// commands are left out of the first step for the same reason as above.
const JSON_REPAIR_COMMANDS = LATEX_COMMAND_NAMES.filter((name) => !['nu', 'ni', 'in', 'to'].includes(name));
const LOOSE_LATEX_BACKSLASH = new RegExp(
  `(^|[^\\\\])\\\\(?=(?:${[...JSON_REPAIR_COMMANDS].sort((a, b) => b.length - a.length).join('|')})(?![A-Za-z]))`,
  'g',
);

export function repairJsonLatexBackslashes(content: string): string {
  const doubled = content.replace(LOOSE_LATEX_BACKSLASH, (_match, prefix: string) => `${prefix}\\\\`);
  let result = '';
  let i = 0;
  while (i < doubled.length) {
    if (doubled[i] !== '\\') {
      result += doubled[i++];
      continue;
    }
    const next = doubled[i + 1] ?? '';
    if ('"\\/bfnrt'.includes(next) && next !== '') {
      result += doubled[i] + next;
      i += 2;
    } else if (next === 'u' && /^[0-9a-fA-F]{4}/.test(doubled.slice(i + 2, i + 6))) {
      result += doubled.slice(i, i + 6);
      i += 6;
    } else {
      result += '\\\\';
      i += 1;
    }
  }
  return result;
}
