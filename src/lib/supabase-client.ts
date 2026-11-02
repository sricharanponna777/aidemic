import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnv } from './supabase-env';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

// supabase-js logs this via console.error whenever a stored session's
// refresh token is rejected (e.g. stale session from a previous Supabase
// project, or a revoked session), even though it already handles the case
// by clearing the session and firing SIGNED_OUT. Next's dev overlay treats
// that console.error as a crash, so we silence just this known-benign case.
const patchConsoleErrorForStaleRefreshToken = () => {
  // Dev only. The justification above is entirely about Next's dev overlay, but
  // this used to run in production too -- permanently swallowing every
  // "Refresh Token Not Found" for every user, including the ones that were not
  // benign at all. The middleware was dropping rotated session cookies on any
  // redirect (see withCsp in src/proxy.ts), and this is the error that would
  // have made that visible.
  if (process.env.NODE_ENV === 'production') return;

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const [first] = args;
    const isStaleRefreshTokenError =
      first instanceof Error &&
      first.name === 'AuthApiError' &&
      first.message.includes('Refresh Token Not Found');

    if (!isStaleRefreshTokenError) {
      originalConsoleError(...args);
    }
  };
};

export const createClient = () => {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  if (!browserClient) {
    patchConsoleErrorForStaleRefreshToken();
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }

  return browserClient;
};
