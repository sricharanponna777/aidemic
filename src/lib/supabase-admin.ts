import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdminEnv } from './supabase-env';

// Service-role client: bypasses Row Level Security. Only import from server
// route handlers -- never from client components or shared client code. The
// key is read from SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix, so it
// is never bundled into client JavaScript).
export const createAdminClient = () => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseAdminEnv();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

// Admin client, or null when the service key is unset. For best-effort server
// work -- the Learning Spine dual-writes -- that must never break its caller:
// a dropped mastery event is recoverable by replay, a failed marking response
// is a broken feature in the student's face. Use createAdminClient() directly
// wherever a missing key should fail the request instead.
export const tryCreateAdminClient = () => {
  try {
    return createAdminClient();
  } catch (err) {
    console.warn('[supabase-admin] service-role client unavailable:', err);
    return null;
  }
};
