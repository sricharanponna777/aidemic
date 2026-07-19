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
