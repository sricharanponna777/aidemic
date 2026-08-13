import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getOptionalSupabaseEnv } from './lib/supabase-env';
import { STUDENT_ONLY_PREFIXES } from './lib/nav';

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
    const isTeacherRoute = pathname.startsWith('/dashboard/teacher');
    const isParentRoute = pathname.startsWith('/dashboard/parent');
    const isStudentRoute = STUDENT_ONLY_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

    if (isTeacherRoute || isParentRoute || isStudentRoute) {
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user!.id).maybeSingle();
      const role = profile?.role;
      // A null role predates the role column, so treat it as a student.
      const home = role === 'teacher' ? '/dashboard/teacher' : role === 'parent' ? '/dashboard/parent' : '/dashboard';

      const allowed = isTeacherRoute
        ? role === 'teacher'
        : isParentRoute
        ? role === 'parent'
        : role !== 'teacher' && role !== 'parent';

      if (!allowed) {
        return NextResponse.redirect(new URL(home, request.url));
      }
    }

    if (pathname.startsWith('/dashboard/admin')) {
      const { data: adminRow } = await supabase.from('platform_admins').select('user_id').eq('user_id', user!.id).maybeSingle();
      if (!adminRow) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
  }

  // `mode=reset` is the one authenticated state that belongs on /login: the
  // recovery session minted by /auth/confirm exists purely so the user can set
  // a new password, so bouncing it to /dashboard would strand the reset form.
  if (pathname === '/login' && isAuthenticated && request.nextUrl.searchParams.get('mode') !== 'reset') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/auth/:path*'],
};
