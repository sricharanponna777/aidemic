import { describe, expect, it } from 'vitest';
import { renderRichText } from './richText';

const md = (value: string) => renderRichText(value, 'markdown');
const inline = (value: string) => renderRichText(value, 'inline');
const plain = (value: string) => renderRichText(value, 'plain');
const mathCount = (html: string) => (html.match(/class="katex"/g) ?? []).length;
const textOf = (html: string) =>
  html
    .replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

describe('math delimiters', () => {
  it.each([
    ['\\(x^{2}\\)', false],
    ['\\[x^{2}\\]', true],
    ['$x^{2}$', false],
    ['$$x^{2}$$', true],
  ])('renders %s', (source, display) => {
    const html = md(source);
    expect(mathCount(html)).toBe(1);
    expect(html.includes('katex-display')).toBe(display);
  });

  it('renders display maths spread over several lines', () => {
    expect(mathCount(md('Start\n$$\na = b\n\\\\\nc = d\n$$\nEnd'))).toBe(1);
  });

  it('accepts over-escaped delimiters from double-escaped JSON', () => {
    const html = md('\\\\(\\\\frac{1}{2}\\\\)');
    expect(mathCount(html)).toBe(1);
    expect(html).not.toContain('math-fallback');
    expect(textOf(html)).not.toContain('\\');
  });

  it('does not treat prices as maths', () => {
    expect(mathCount(md('It costs $5 and $10 each.'))).toBe(0);
    expect(mathCount(md('Between $5-$10 per hour'))).toBe(0);
    expect(textOf(md('It costs $5 and $10 each.'))).toContain('$5 and $10');
  });

  it('shows an escaped dollar literally', () => {
    expect(textOf(md('Price: \\$4.50'))).toBe('Price: $4.50');
  });

  it('keeps a percentage inside maths instead of commenting out the rest', () => {
    const html = md('\\(50% \\times 2\\)');
    expect(html).not.toContain('math-fallback');
    expect(html).toContain('×');
  });

  it('renders mhchem and siunitx notation', () => {
    expect(md('\\(\\ce{H2O}\\)')).not.toContain('math-fallback');
    expect(md('\\(\\SI{9.8}{m/s^2}\\)')).not.toContain('math-fallback');
  });

  it('falls back to readable source text, never a red KaTeX error', () => {
    const html = md('\\(\\undefinedcommand{x}\\)');
    expect(html).toContain('math-fallback');
    expect(html).not.toContain('katex-error');
    expect(html).toContain('\\undefinedcommand{x}');
  });

  it('repairs unbalanced braces from a truncated formula', () => {
    expect(md('\\(\\frac{1}{2\\)')).not.toContain('math-fallback');
  });

  it('drops an unclosed delimiter left by truncation instead of showing it', () => {
    const html = md('Answer: \\( x = \\frac{1}{2}');
    expect(textOf(html)).not.toContain('\\(');
    expect(mathCount(html)).toBe(1);
  });
});

describe('bare LaTeX in prose', () => {
  it('wraps undelimited commands', () => {
    expect(mathCount(md('The area is \\pi r^{2} square units.'))).toBe(1);
    expect(textOf(md('The area is \\pi r^{2} square units.'))).toContain('square units.');
  });

  it('keeps a whole \\text{...} group together', () => {
    const html = md('Use \\text{the formula} here');
    expect(html).not.toContain('math-fallback');
    expect(textOf(html)).toContain('here');
  });

  it('does not swallow surrounding punctuation or parentheses', () => {
    const html = md('(approximately \\frac{1}{2}).');
    expect(textOf(html).endsWith(').')).toBe(true);
  });

  it('wraps a bare matrix environment', () => {
    expect(mathCount(md('\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}'))).toBe(1);
  });

  it('restores LaTeX mangled into control characters by JSON.parse', () => {
    expect(mathCount(md('\\(\u000crac{1}{2}\\)'))).toBe(1);
    expect(md('\\(\u000crac{1}{2}\\)')).not.toContain('math-fallback');
    expect(md('\\(\theta\\)')).not.toContain('math-fallback');
    expect(md('\\(\u0008eta\\)')).not.toContain('math-fallback');
  });

  it('does not turn a newline before "u = 5" into \\nu', () => {
    expect(textOf(md('Initial speed:\nu = 5 m/s'))).toContain('u = 5');
  });
});

describe('plain-text scripts', () => {
  it('turns carets into superscripts', () => {
    expect(md('x^2 + 3x')).toContain('x<sup>2</sup> + 3x');
    expect(md('10^-3')).toContain('10<sup>-3</sup>');
    expect(md('x^{n+1}')).toContain('x<sup>n+1</sup>');
  });

  it('only subscripts the braced form, leaving snake_case alone', () => {
    expect(md('H_{2}O')).toContain('H<sub>2</sub>O');
    expect(md('my_variable_name')).toContain('my_variable_name');
  });
});

describe('markdown', () => {
  it('formats bold, italic and strikethrough', () => {
    const html = md('**bold** and *italic* and ~~gone~~');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<del>gone</del>');
  });

  it('leaves multiplication asterisks alone', () => {
    expect(md('2 * 3 * 4 = 24')).not.toContain('<em>');
  });

  it('never reads markdown inside maths', () => {
    const html = md('$a*b*c$ and \\(x_1 + y_1\\)');
    expect(html).not.toContain('<em>');
    expect(mathCount(html)).toBe(2);
  });

  it('keeps ordered-list numbering across blank lines', () => {
    const html = md('1. First\n\n2. Second\n\n3. Third');
    expect((html.match(/<ol/g) ?? []).length).toBe(1);
    expect((html.match(/<li>/g) ?? []).length).toBe(3);
  });

  it('honours an ordered list that starts after 1', () => {
    expect(md('3. Third\n4. Fourth')).toContain('<ol start="3">');
  });

  it('nests indented lists', () => {
    const html = md('- Parent\n  - Child\n- Sibling');
    expect(html.replace(/\s+</g, '<')).toContain('<ul><li>Parent<ul><li>Child</li></ul></li><li>Sibling</li></ul>');
  });

  it('continues a list item onto an indented line', () => {
    const html = md('1. Step one\n   with detail\n2. Step two');
    expect((html.match(/<ol/g) ?? []).length).toBe(1);
    expect(html).toContain('<br />with detail');
  });

  it('supports all heading levels and keeps a trailing #', () => {
    expect(md('##### Five')).toContain('<h5>Five</h5>');
    expect(md('# C#')).toContain('<h1>C#</h1>');
  });

  it('renders horizontal rules', () => {
    expect(md('Above\n\n---\n\nBelow')).toContain('<hr />');
  });

  it('renders tables, with | inside maths not splitting a cell', () => {
    const html = md('| x | \\(|x|\\) |\n|---|---|\n| -2 | 2 |');
    expect(html).toContain('<table>');
    expect((html.match(/<th[ >]/g) ?? []).length).toBe(2);
    expect((html.match(/<td/g) ?? []).length).toBe(2);
  });

  it('shows code verbatim, maths and markdown included', () => {
    const html = md('Run `echo $HOME $PATH` then\n```\nprice = "$5"; x = a*b*c\n```');
    expect(html).toContain('<code>echo $HOME $PATH</code>');
    expect(html).toContain('price = &quot;$5&quot;; x = a*b*c');
    expect(mathCount(html)).toBe(0);
  });

  it('only links http(s) URLs', () => {
    expect(md('[site](https://example.com)')).toContain('<a href="https://example.com"');
    expect(md('[bad](javascript:alert(1))')).not.toContain('<a ');
  });

  it('honours backslash escapes', () => {
    expect(md('\\*not italic\\*')).not.toContain('<em>');
  });
});

describe('safety', () => {
  it('escapes raw HTML that is not a known formatting tag', () => {
    const html = md('<script>alert(1)</script><img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
  });

  it('does not strip inequalities as if they were tags', () => {
    expect(textOf(md('if a < b and b > c then'))).toContain('if a < b and b > c then');
    expect(mathCount(md('\\(a < b\\) and \\(c > d\\)'))).toBe(2);
  });

  it('cannot be confused by placeholder characters in the input', () => {
    expect(() => md('\uE0000\uE001 $x$')).not.toThrow();
    expect(mathCount(md('\uE0000\uE001 $x$'))).toBe(1);
  });
});

describe('rich-text editor HTML', () => {
  it('keeps bold and italic from Tiptap and decodes entities once', () => {
    const html = md('<p>The <strong>derivative</strong> of <em>f</em> &amp; g</p>');
    expect(html).toContain('<strong>derivative</strong>');
    expect(html).toContain('<em>f</em>');
    expect(textOf(html)).toContain('& g');
    expect(html).not.toContain('&amp;amp;');
  });

  it('turns <sub>/<sup> into maths', () => {
    expect(mathCount(md('<p>H<sub>2</sub>O and x<sup>2</sup></p>'))).toBe(2);
  });
});

describe('modes', () => {
  it('inline mode never emits block elements', () => {
    const html = inline('Line one\n\n- not a list\n# not a heading');
    expect(html).not.toMatch(/<(p|ul|h1|li)\b/);
  });

  it('plain mode renders maths and line breaks but no markdown', () => {
    const html = plain('**2** * x\n\\(\\frac{1}{2}\\)');
    expect(html).not.toContain('<strong>');
    expect(html).toContain('<br />');
    expect(mathCount(html)).toBe(1);
  });

  it('renders the same twice (no hidden state between calls)', () => {
    const source = 'Find $x$ when \\(x^2 = 4\\) and **check**.';
    expect(md(source)).toBe(md(source));
  });

  it('never throws, never shows a KaTeX error and never passes raw markup through, on garbage input', () => {
    const pieces = ['$', '$$', '\\(', '\\)', '\\[', '\\]', '\\frac{', '}', '{', '^', '_', '*', '**', '`', '```\n', '|', '\n',
      '\n\n', '- ', '1. ', '# ', '> ', '<b>', '</p>', '<script>', '&amp;', '%', '#', '&', 'x', '2', ' ', '\\pi', '\\begin{cases}',
      '\\end{cases}', '\\\\', '\u000c', '', '[a](https://x.y)', '~~', '\\$'];
    let seed = 42;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
    for (let run = 0; run < 3000; run += 1) {
      const source = Array.from({ length: 1 + Math.floor(random() * 25) }, () => pieces[Math.floor(random() * pieces.length)]).join('');
      for (const mode of ['markdown', 'inline', 'plain'] as const) {
        const html = renderRichText(source, mode);
        expect(html).not.toContain('katex-error');
        expect(html).not.toContain('<script');
        expect(html).not.toMatch(/[]/);
      }
    }
  });

  it('handles empty input', () => {
    expect(md('')).toBe('');
    expect(md(null as unknown as string)).toBe('');
  });
});
