/**
 * The inline script that resolves the theme before first paint.
 *
 * It lives in its own module because two places need the *same* bytes: the root
 * layout, which renders it, and src/lib/csp.ts, which allow-lists its SHA-256
 * digest. Editing the string without updating the digest would silently
 * reintroduce the bug this exists to fix -- so themeScript.test.ts recomputes the
 * digest from this constant and fails if the two disagree.
 *
 * Why a hash and not a nonce: the root layout renders on every route, including
 * the statically prerendered public pages, and reading the per-request nonce out
 * of headers() there would opt every one of them into dynamic rendering -- which
 * is the exact thing the two-policy split in csp.ts exists to avoid.
 *
 * Two details have to stay in step with getStoredTheme() in src/hooks/useTheme.ts,
 * because useTheme's readInitialTheme() trusts whatever class this script wrote
 * and can never correct it afterwards:
 *
 *   - the read is wrapped in try/catch. Accessing localStorage *throws* where site
 *     data is blocked (private mode, Safari's cross-site tracking prevention), and
 *     an uncaught throw here kills the IIFE before it writes any class -- the exact
 *     flash this module exists to prevent, on every page load.
 *   - only "light" and "dark" count as a stored choice. Treating any truthy string
 *     as authoritative meant a stale or unrecognised value pinned the user to light
 *     mode permanently, rather than falling back to their OS preference.
 */
export const THEME_INITIALIZER = `
(() => {
  const root = document.documentElement;
  let stored = null;
  try {
    stored = window.localStorage.getItem("aidemic-theme");
  } catch (e) {}
  const isDark =
    stored === "dark" || stored === "light"
      ? stored === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.classList.remove("light", "dark");
  root.classList.add(isDark ? "dark" : "light");
  root.style.colorScheme = isDark ? "dark" : "light";
})();
`;

/**
 * SHA-256 of THEME_INITIALIZER, base64, in the form script-src expects.
 *
 * Hard-coded rather than computed at request time: the middleware runs on the
 * edge runtime, where the only digest API is async (crypto.subtle), and building
 * the CSP is synchronous. The test keeps it honest.
 */
export const THEME_INITIALIZER_HASH = 'sha256-KQ7wG9Umtmwps6+qeiS3x6+ptXzcfdvdJyijc+PJIGM=';
