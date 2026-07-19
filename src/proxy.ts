import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getOptionalSupabaseEnv } from './lib/supabase-env';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });

  const supabaseEnv = getOptionalSupabaseEnv();

  if (!supabaseEnv) {
    if (pathname.startsWith('/dashboard')) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    return response;
  }

  const supabase = createServerClient(supabaseEnv.supabaseUrl, supabaseEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const isAuthenticated = Boolean(user);

  if (pathname.startsWith('/dashboard')) {
    if (!isAuthenticated) {
      const redirectUrl = new URL('/', request.url);
      redirectUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(redirectUrl);
    }

    // Defense-in-depth only: RLS is the real authorization backstop. These
    // checks just stop an unauthorized user from ever rendering the page.
    if (pathname.startsWith('/dashboard/teacher')) {
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user!.id).maybeSingle();
      if (profile?.role !== 'teacher') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }

    if (pathname.startsWith('/dashboard/parent')) {
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user!.id).maybeSingle();
      if (profile?.role !== 'parent') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }

    if (pathname.startsWith('/dashboard/admin')) {
      const { data: adminRow } = await supabase.from('platform_admins').select('user_id').eq('user_id', user!.id).maybeSingle();
      if (!adminRow) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
  }

  if (pathname === '/login' && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/auth/:path*'],
};
