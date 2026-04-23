import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get session from cookies
  const supabaseSession = request.cookies.get('sb-access-token');

  console.log('[middleware]', {
    pathname,
    hasSbAccessToken: !!supabaseSession,
  });

  // if we have a token, verify it's still valid with Supabase
  let sessionValid = false;
  if (supabaseSession) {
    try {
      const supabase = await createServerClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('[middleware] session validation error', error.message);
      } else if (data?.session) {
        // double check token matches cookie (should be automatic)
        sessionValid = true;
      }
    } catch (err) {
      console.error('[middleware] failed to validate session', err);
    }
  }

  // Protect dashboard routes
  if (pathname.startsWith('/dashboard')) {
    if (!supabaseSession || !sessionValid) {
      console.log('[middleware] No sb-access-token, redirecting to /login');
      return NextResponse.redirect(new URL('/login', request.url));
    }
    console.log('[middleware] sb-access-token found, allowing /dashboard access');
  }

  // Redirect logged-in users away from login
  if (pathname === '/login' && supabaseSession && sessionValid) {
    console.log('[middleware] User already has session, redirecting from /login to /dashboard');
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/auth/:path*'],
};
