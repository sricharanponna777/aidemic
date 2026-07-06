-- ============================================================================
-- Fix infinite recursion in "teachers" RLS policies.
--
-- The school-admin SELECT/UPDATE policies added in add_school_verification
-- queried "teachers" from within a policy defined on "teachers" itself,
-- which re-triggers the same policy on every evaluation (infinite
-- recursion). Move the self-lookup into a SECURITY DEFINER function, which
-- runs as the table owner and therefore bypasses RLS internally.
-- ============================================================================
CREATE OR REPLACE FUNCTION is_school_admin_for(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM teachers
    WHERE user_id = auth.uid()
    AND school_id = p_school_id
    AND is_school_admin = true
  );
$$;

DROP POLICY IF EXISTS "School admins can view teachers at their school" ON teachers;
CREATE POLICY "School admins can view teachers at their school"
  ON teachers FOR SELECT
  USING (is_school_admin_for(school_id));

DROP POLICY IF EXISTS "School admins can update teachers at their school" ON teachers;
CREATE POLICY "School admins can update teachers at their school"
  ON teachers FOR UPDATE
  USING (is_school_admin_for(school_id));
