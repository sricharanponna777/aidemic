import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getOptionalSupabaseEnv } from './lib/supabase-env';
import { STUDENT_ONLY_PREFIXES } from './lib/nav';
import { readCachedRole, writeCachedRole } from './lib/roleCache';
import { buildContentSecurityPolicy, usesStrictCsp } from './lib/csp';

/** The prefixes this middleware actually authenticates. The matcher below is deliberately
 * wider than this -- every HTML response needs a per-request CSP nonce -- so the Supabase
 * client and its getClaims() round trip stay gated on the original set rather than running
 * on every asset and API request. */
const requiresAuthCheck = (pathname: string) =>
  pathname.startsWith('/dashboard') || pathname === '/login' || pathname.startsWith('/auth');

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // A fresh nonce per request is the whole point: a CSP that allowlists 'unsafe-inline'
  // lets any injected <script> run, which is most of what a CSP is meant to stop.
  // Next reads the nonce out of the Content-Security-Policy header on the *request* and
  // stamps it onto the inline bootstrap scripts it emits, so it is set on both sides.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildContentSecurityPolicy({
    nonce,
    strict: usesStrictCsp(pathname),
    isDev: process.env.NODE_ENV !== 'production',
  });

  // Rebuilt on demand rather than captured once: the Supabase cookie handler mutates
  // request.cookies, and those updated cookies have to reach the rendered page.
  const requestHeaders = () => {
    const headers = new Headers(request.headers);
    headers.set('x-nonce', nonce);
    headers.set('Content-Security-Policy', csp);
    return headers;
  };

  const withCsp = <T extends NextResponse>(res: T): T => {
    res.headers.set('Content-Security-Policy', csp);
    return res;
  };

  let response = NextResponse.next({ request: { headers: requestHeaders() } });

  if (!requiresAuthCheck(pathname)) return withCsp(response);

  const supabaseEnv = getOptionalSupabaseEnv();

  if (!supabaseEnv) {
    if (pathname.startsWith('/dashboard')) {
      return withCsp(NextResponse.redirect(new URL('/', request.url)));
    }

    return withCsp(response);
  }

  const supabase = createServerClient(supabaseEnv.supabaseUrl, supabaseEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders() } });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getClaims() verifies the JWT locally against Supabase's cached JWKS
  // (asymmetric signing keys only) instead of getUser()'s round trip to the
  // Auth server on every request. It falls back to getUser() automatically
  // for symmetric-signed projects, so this is safe either way.
  const { data: claimsData } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(claimsData?.claims);
  const userId = claimsData?.claims.sub;

  if (pathname.startsWith('/dashboard')) {
    if (!isAuthenticated) {
      const redirectUrl = new URL('/', request.url);
      redirectUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      return withCsp(NextResponse.redirect(redirectUrl));
    }

    // Defense-in-depth only: RLS is the real authorization backstop. These
    // checks just stop an unauthorized user from ever rendering the page.
    const isTeacherRoute = pathname.startsWith('/dashboard/teacher');
    const isParentRoute = pathname.startsWith('/dashboard/parent');
    const isStudentRoute = STUDENT_ONLY_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

    if (isTeacherRoute || isParentRoute || isStudentRoute) {
      const cachedRole = await readCachedRole(request, userId!);
      let role: string | null;
      let freshLookup = false;

      if (cachedRole !== undefined) {
        role = cachedRole;
      } else {
        const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', userId!).maybeSingle();
        role = profile?.role ?? null;
        freshLookup = true;
      }

      // A null role predates the role column, so treat it as a student.
      const home = role === 'teacher' ? '/dashboard/teacher' : role === 'parent' ? '/dashboard/parent' : '/dashboard';

      const allowed = isTeacherRoute
        ? role === 'teacher'
        : isParentRoute
        ? role === 'parent'
        : role !== 'teacher' && role !== 'parent';

      if (!allowed) {
        const redirectResponse = NextResponse.redirect(new URL(home, request.url));
        if (freshLookup) await writeCachedRole(redirectResponse, userId!, role);
        return withCsp(redirectResponse);
      }

      if (freshLookup) await writeCachedRole(response, userId!, role);
    }

    if (pathname.startsWith('/dashboard/admin')) {
      const { data: adminRow } = await supabase.from('platform_admins').select('user_id').eq('user_id', userId!).maybeSingle();
      if (!adminRow) {
        return withCsp(NextResponse.redirect(new URL('/dashboard', request.url)));
      }
    }
  }

  // `mode=reset` is the one authenticated state that belongs on /login: the
  // recovery session minted by /auth/confirm exists purely so the user can set
  // a new password, so bouncing it to /dashboard would strand the reset form.
  if (pathname === '/login' && isAuthenticated && request.nextUrl.searchParams.get('mode') !== 'reset') {
    return withCsp(NextResponse.redirect(new URL('/dashboard', request.url)));
  }

  return withCsp(response);
}

export const config = {
  // Everything except Next's own static output and image files, which are served
  // straight from the CDN and carry no inline scripts to protect.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|mp3|mp4|webm)$).*)',
  ],
};
