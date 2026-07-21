-- ============================================================================
-- MVP security hardening
--   1. Freeze user_profiles.role after signup (block self-escalation)
--   2. Restrict schools SELECT to authenticated users (no anon enumeration)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Lock down role writes.
--
-- The user_profiles UPDATE policy is USING (auth.uid() = id) with no WITH CHECK,
-- and onboarding/login upsert `role` straight from a client-supplied URL param.
-- That lets any signed-in user flip their own role to teacher/parent at will.
--
-- Signup still legitimately sets role once on INSERT (student/teacher/parent),
-- so we don't touch INSERT -- we only freeze role on UPDATE. A trigger is used
-- rather than a policy WITH CHECK because it can compare against the prior row.
-- The service role retains an escape hatch for admin corrections.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_user_profile_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Changing your account role is not allowed.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_freeze_role ON user_profiles;
CREATE TRIGGER user_profiles_freeze_role
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION prevent_user_profile_role_change();

-- ----------------------------------------------------------------------------
-- 2. Restrict schools SELECT to authenticated users.
--
-- The original policy (20260707100000) has no `TO` clause, so it applies to the
-- `public` role including `anon` -- any unauthenticated visitor could enumerate
-- pending/approved school names. Scope it to authenticated users; the
-- created_by = auth.uid() branch is a no-op for anon anyway.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view non-rejected schools or their own" ON schools;
CREATE POLICY "Users can view non-rejected schools or their own"
  ON schools FOR SELECT
  TO authenticated
  USING (status IN ('pending', 'approved') OR created_by = auth.uid());
