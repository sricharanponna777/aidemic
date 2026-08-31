// Content-Security-Policy, built per request so the authenticated app can carry a nonce.
//
// It lives here rather than in next.config.ts because a nonce cannot be part of a static
// header: the whole value of one is that it changes every response, so an injected
// <script> can never guess it. next.config.ts still carries the genuinely static headers
// (HSTS, X-Frame-Options, ...).
//
// Two policies, because Next can only stamp a nonce onto its inline bootstrap scripts on
// pages it renders per request:
//
//   /dashboard/*  strict  -- 'nonce-...' + 'strict-dynamic', no 'unsafe-inline'. The
//                            segment opts into per-request rendering (see
//                            src/app/dashboard/layout.tsx) precisely so this can work.
//   everything else       -- still 'unsafe-inline' for scripts. These pages are statically
//                            prerendered at build time, so their script tags cannot carry
//                            a nonce; sending one would block every script and serve a
//                            blank page. They hold no user data and no authenticated
//                            session, so the weaker policy is the accepted trade.
//
// Neither policy allows 'unsafe-eval' in production: nothing in the client bundle calls
// eval() or new Function(), so it was pure attack surface. Dev keeps it for Fast Refresh.

// REST, Realtime websockets, Storage and Edge Functions all live on *.supabase.co.
// AI calls go through same-origin API routes, so no provider origin is needed.
const SUPABASE_ORIGINS = 'https://*.supabase.co wss://*.supabase.co';

export interface CspOptions {
  /** Per-request nonce. Only used when `strict` is set. */
  nonce: string;
  /** True for per-request-rendered routes that can receive the nonce. */
  strict: boolean;
  /** Dev needs 'unsafe-eval' for Fast Refresh and websockets to the dev server. */
  isDev: boolean;
}

export function buildContentSecurityPolicy({ nonce, strict, isDev }: CspOptions): string {
  const scriptSrc = strict
    ? // 'strict-dynamic' lets the nonced bootstrap script load the app's own chunks
      // without allowlisting every URL. CSP3 browsers ignore 'self' once it is present;
      // it stays for older browsers, which ignore 'strict-dynamic' instead.
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`
    : `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`;

  return [
    "default-src 'self'",
    scriptSrc,
    // Still 'unsafe-inline', on both policies. React writes element style props as inline
    // style attributes and KaTeX injects its own, and neither can be nonced -- style-src-attr
    // has no nonce mechanism at all. The exposure is CSS injection, not script execution,
    // which is the risk the script-src nonce actually closes.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${SUPABASE_ORIGINS}`,
    "font-src 'self' data:",
    `connect-src 'self' ${SUPABASE_ORIGINS}${isDev ? ' ws://localhost:* http://localhost:*' : ''}`,
    `media-src 'self' blob: ${SUPABASE_ORIGINS}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/** The routes rendered per request, and so the only ones that can carry a nonce. */
export const usesStrictCsp = (pathname: string) => pathname.startsWith('/dashboard');
