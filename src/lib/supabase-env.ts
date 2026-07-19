const stripWrappingQuotes = (value: string) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const assertFetchHeaderSafe = (name: string, value: string) => {
  const invalid = [...value].find((char) => char.charCodeAt(0) > 255);
  if (invalid) {
    throw new Error(
      `${name} contains a Unicode character that cannot be used in fetch headers. Re-copy it from Supabase into your Vercel environment variables as plain text.`
    );
  }
};

export const getSupabaseEnv = () => {
  const supabaseUrl = stripWrappingQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  const supabaseAnonKey = stripWrappingQuotes(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  assertFetchHeaderSafe('NEXT_PUBLIC_SUPABASE_URL', supabaseUrl);
  assertFetchHeaderSafe('NEXT_PUBLIC_SUPABASE_ANON_KEY', supabaseAnonKey);

  return { supabaseUrl, supabaseAnonKey };
};

export const getSupabaseAdminEnv = () => {
  const { supabaseUrl } = getSupabaseEnv();
  const serviceRoleKey = stripWrappingQuotes(process.env.SUPABASE_SERVICE_ROLE_KEY || '');

  if (!serviceRoleKey) {
    throw new Error('Supabase admin is not configured. Set SUPABASE_SERVICE_ROLE_KEY (server-only).');
  }

  assertFetchHeaderSafe('SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey);

  return { supabaseUrl, serviceRoleKey };
};

export const getOptionalSupabaseEnv = () => {
  try {
    return getSupabaseEnv();
  } catch (error) {
    console.error('Supabase environment configuration error:', error);
    return null;
  }
};
