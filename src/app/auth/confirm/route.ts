import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase-server';

/**
 * Redeems the token hash carried by a Brevo-sent auth email.
 *
 * The counterpart to /api/auth/reset-password: because that route builds the
 * link itself from generateLink()'s hashed_token, the address the user clicks
 * is on aidemic.co.uk and the exchange happens here rather than on the
 * project's supabase.co host. verifyOtp writes the session straight to the SSR
 * cookies, which the browser client then reads (@supabase/ssr sets them
 * non-httpOnly) -- so /login?mode=reset can call updateUser() directly.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next');
  // Relative paths only: `next` comes off a URL anyone can edit.
  const target = next?.startsWith('/') ? next : '/dashboard';

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(target, request.nextUrl.origin));
    }
    console.error('[auth/confirm] verifyOtp failed:', error.message);
  }

  // Expired, already used, or tampered with. Land on the request form with an
  // explanation rather than a blank sign-in page.
  return NextResponse.redirect(new URL('/login?mode=forgot&error=link-invalid', request.nextUrl.origin));
}
