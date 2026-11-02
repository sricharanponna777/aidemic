import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { THEME_INITIALIZER, THEME_INITIALIZER_HASH } from './themeScript';
import { buildContentSecurityPolicy } from './csp';
import { STORAGE_KEY } from '@/hooks/useTheme';

/**
 * Runs the inline script against stubbed globals and reports what it wrote.
 *
 * The script is a string, so nothing else in the suite executes it -- the hash
 * test only proves it is allowed to run, not that running it does the right
 * thing. new Function is the only way to reach it; it is confined to this test
 * and never ships (the client bundle carries no eval, which is why neither CSP
 * policy allows unsafe-eval).
 */
const runInitializer = (options: { stored?: string | null; throws?: boolean; prefersDark: boolean }) => {
  const classes = new Set<string>();
  const root = {
    classList: {
      remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
      add: (name: string) => classes.add(name),
    },
    style: {} as { colorScheme?: string },
  };
  const win = {
    localStorage: {
      getItem: () => {
        if (options.throws) throw new DOMException('The operation is insecure.', 'SecurityError');
        return options.stored ?? null;
      },
    },
    matchMedia: (query: string) => ({ matches: query.includes('dark') && options.prefersDark }),
  };
  new Function('window', 'document', THEME_INITIALIZER)(win, { documentElement: root });
  return { classes: [...classes], colorScheme: root.style.colorScheme };
};

describe('theme script behaviour', () => {
  it('honours a stored choice over the OS preference', () => {
    expect(runInitializer({ stored: 'dark', prefersDark: false }).classes).toEqual(['dark']);
    expect(runInitializer({ stored: 'light', prefersDark: true }).classes).toEqual(['light']);
  });

  it('falls back to the OS preference with nothing stored', () => {
    expect(runInitializer({ stored: null, prefersDark: true }).classes).toEqual(['dark']);
    expect(runInitializer({ stored: null, prefersDark: false }).classes).toEqual(['light']);
  });

  // Reading localStorage THROWS where site data is blocked. Unguarded, the throw
  // killed the IIFE before it wrote any class, so the page painted unthemed --
  // the exact flash this script exists to prevent, on every single load.
  it('still themes the page when localStorage throws', () => {
    expect(() => runInitializer({ throws: true, prefersDark: true })).not.toThrow();
    expect(runInitializer({ throws: true, prefersDark: true }).classes).toEqual(['dark']);
    expect(runInitializer({ throws: true, prefersDark: false }).classes).toEqual(['light']);
  });

  // getStoredTheme() in useTheme accepts only 'light'/'dark'. When this script
  // treated any truthy string as a choice, a stale value resolved to light and
  // readInitialTheme() then TRUSTED that class -- pinning a dark-preferring user
  // to light with no way for the hook to correct it.
  it('ignores a stored value that is neither light nor dark', () => {
    expect(runInitializer({ stored: 'system', prefersDark: true }).classes).toEqual(['dark']);
    expect(runInitializer({ stored: '', prefersDark: true }).classes).toEqual(['dark']);
  });

  it('sets colorScheme to match the class it wrote', () => {
    expect(runInitializer({ stored: 'dark', prefersDark: false }).colorScheme).toBe('dark');
    expect(runInitializer({ stored: 'light', prefersDark: true }).colorScheme).toBe('light');
  });
});

describe('theme script CSP hash', () => {
  // The whole point of the pair. If someone edits the script and not the digest,
  // the strict /dashboard/* policy stops allowing it and the anti-FOUC script is
  // silently refused again -- visible only as a console violation and a flash of
  // the wrong theme, which is precisely how it went unnoticed before.
  it('matches the script it is supposed to allow', () => {
    const digest = createHash('sha256').update(THEME_INITIALIZER, 'utf8').digest('base64');
    expect(THEME_INITIALIZER_HASH).toBe(`sha256-${digest}`);
  });

  // The script writes the class useTheme's readInitialTheme() then trusts, so the
  // two have to be reading and writing the same key. It cannot import the constant
  // (the bytes must be static to hash), which leaves this as the only thing
  // standing between a rename and an anti-FOUC script reading a dead key.
  it('reads the same storage key useTheme writes', () => {
    expect(THEME_INITIALIZER).toContain(`"${STORAGE_KEY}"`);
  });

  it('is present in the strict policy, which has no unsafe-inline to fall back on', () => {
    const strict = buildContentSecurityPolicy({ nonce: 'abc', strict: true, isDev: false });
    expect(strict).toContain(`'${THEME_INITIALIZER_HASH}'`);
    // Scoped to script-src. style-src keeps 'unsafe-inline' on both policies by
    // design (React writes inline style attributes, KaTeX injects its own, and
    // style-src-attr has no nonce mechanism), so asserting against the whole
    // header would be testing the wrong directive.
    const scriptSrc = strict.split('; ').find((directive) => directive.startsWith('script-src'))!;
    expect(scriptSrc).not.toContain('unsafe-inline');
    // A hash is only honoured alongside strict-dynamic; a nonce alone would not
    // cover a script tag the layout cannot stamp.
    expect(strict).toContain("'strict-dynamic'");
  });

  it('is not needed on the public policy, which still allows inline scripts', () => {
    const loose = buildContentSecurityPolicy({ nonce: 'abc', strict: false, isDev: false });
    expect(loose).toContain("script-src 'self' 'unsafe-inline'");
  });

  it('declares worker-src explicitly on both policies', () => {
    // Workers fall back to script-src, not default-src, and the strict script-src
    // carries 'strict-dynamic' -- under which 'self' is ignored. pdf.js loads its
    // worker on a /dashboard/* page, so leaving this to the fallback chain left
    // its treatment browser-dependent.
    for (const strict of [true, false]) {
      expect(buildContentSecurityPolicy({ nonce: 'abc', strict, isDev: false })).toContain("worker-src 'self' blob:");
    }
  });

  it('never allows unsafe-eval in production', () => {
    for (const strict of [true, false]) {
      expect(buildContentSecurityPolicy({ nonce: 'abc', strict, isDev: false })).not.toContain('unsafe-eval');
    }
  });
});
