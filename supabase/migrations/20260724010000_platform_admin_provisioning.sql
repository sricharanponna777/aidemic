-- ============================================================================
-- Repeatable platform-admin provisioning.
--
-- 20260707100000 seeded platform_admins from a single hardcoded email. That
-- doesn't generalise to real deployments. This adds a helper so admins are
-- granted by email at deploy time from the Supabase SQL editor (or any
-- service-role connection), with no source edits and no personal address baked
-- into a migration.
--
-- Usage (run once per admin, from the SQL editor):
--   select grant_platform_admin('admin@yourdomain.com');
--
-- The target must already have signed up (a row in auth.users). Returns true if
-- a row was granted, false if the email has no account yet.
-- ============================================================================
CREATE OR REPLACE FUNCTION grant_platform_admin(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO platform_admins (user_id) VALUES (v_user_id)
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

-- Never expose admin provisioning to end users -- SQL editor / service role only.
REVOKE ALL ON FUNCTION grant_platform_admin(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION grant_platform_admin(TEXT) FROM anon;
REVOKE ALL ON FUNCTION grant_platform_admin(TEXT) FROM authenticated;
