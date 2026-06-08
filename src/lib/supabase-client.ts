import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnv } from './supabase-env';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export const createClient = () => {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  browserClient ??= createBrowserClient(
    supabaseUrl,
    supabaseAnonKey
  );

  return browserClient;
};
