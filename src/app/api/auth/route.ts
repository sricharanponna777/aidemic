import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    console.log('[/api/auth] POST request received');
    const body = await request.json();
    const { access_token, refresh_token } = body || {};

    console.log('[/api/auth] Tokens received:', {
      hasAccessToken: !!access_token,
      hasRefreshToken: !!refresh_token,
    });

    if (!access_token || !refresh_token) {
      console.error('[/api/auth] Missing tokens in request body');
      return NextResponse.json({ error: 'Missing tokens in request body' }, { status: 400 });
    }

    const supabase = await createServerClient();

    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) {
      console.error('[/api/auth] Error setting session on server:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[/api/auth] Session set, manually setting cookies in response');
    
    const response = NextResponse.json({ success: true });
    
    // manually set the auth cookies that middleware expects
    response.cookies.set({
      name: 'sb-access-token',
      value: access_token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
    
    response.cookies.set({
      name: 'sb-refresh-token',
      value: refresh_token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    console.log('[/api/auth] Cookies set in response, returning success');
    return response;
  } catch (err) {
    console.error('[/api/auth] Error in /api/auth:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
