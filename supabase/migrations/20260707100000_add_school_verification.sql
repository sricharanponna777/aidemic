-- ============================================================================
-- STEP 1: Schools
-- ============================================================================
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_name_lower ON schools (lower(name));

DROP TRIGGER IF EXISTS schools_set_updated_at ON schools;
CREATE TRIGGER schools_set_updated_at
BEFORE UPDATE ON schools
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

-- ============================================================================
-- STEP 2: Platform admins
-- Membership-only table; no INSERT/UPDATE/DELETE policies -- rows are only
-- ever managed via migration/service role, never via the client API.
-- ============================================================================
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO platform_admins (user_id)
SELECT id FROM auth.users WHERE email = 'sricharanponna777@gmail.com'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- STEP 3: Teacher verification fields
-- ============================================================================
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS is_school_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE teachers DROP CONSTRAINT IF EXISTS teachers_verification_status_check;
ALTER TABLE teachers ADD CONSTRAINT teachers_verification_status_check CHECK (verification_status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_teachers_school_id ON teachers(school_id);

-- ============================================================================
-- STEP 4: Row Level Security
-- ============================================================================
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view non-rejected schools or their own" ON schools;
CREATE POLICY "Users can view non-rejected schools or their own"
  ON schools FOR SELECT
  USING (status IN ('pending', 'approved') OR created_by = auth.uid());

DROP POLICY IF EXISTS "Users can register a new school" ON schools;
CREATE POLICY "Users can register a new school"
  ON schools FOR INSERT
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can view their own platform admin row" ON platform_admins;
CREATE POLICY "Users can view their own platform admin row"
  ON platform_admins FOR SELECT USING (auth.uid() = user_id);

-- School admins can view and approve/reject pending teachers at their own school.
-- Uses a SECURITY DEFINER function rather than a plain self-join subquery so
-- the policy doesn't re-trigger itself on "teachers" (infinite recursion).
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

-- ============================================================================
-- STEP 5: Platform-admin RPCs to approve/reject a school (and its founding admin)
-- ============================================================================
CREATE OR REPLACE FUNCTION approve_school(p_school_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE schools SET status = 'approved' WHERE id = p_school_id;
  UPDATE teachers SET verification_status = 'approved' WHERE school_id = p_school_id AND is_school_admin = true;
END;
$$;

CREATE OR REPLACE FUNCTION reject_school(p_school_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE schools SET status = 'rejected' WHERE id = p_school_id;
  UPDATE teachers SET verification_status = 'rejected' WHERE school_id = p_school_id AND is_school_admin = true;
END;
$$;

REVOKE EXECUTE ON FUNCTION approve_school(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION approve_school(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION reject_school(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION reject_school(UUID) TO authenticated;

-- ============================================================================
-- STEP 6: Gate class joining on the owning teacher/school being approved
-- ============================================================================
CREATE OR REPLACE FUNCTION join_class_by_invite_code(p_invite_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_class_id UUID;
  v_teacher_verified BOOLEAN;
  v_school_approved BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT c.id, (t.verification_status = 'approved'), (s.status = 'approved')
  INTO v_class_id, v_teacher_verified, v_school_approved
  FROM classes c
  JOIN teachers t ON t.id = c.teacher_id
  LEFT JOIN schools s ON s.id = t.school_id
  WHERE c.invite_code = upper(trim(p_invite_code));

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  IF NOT COALESCE(v_teacher_verified, false) OR NOT COALESCE(v_school_approved, false) THEN
    RAISE EXCEPTION 'This class is not open for joining yet';
  END IF;

  INSERT INTO class_students (class_id, student_id, status)
  VALUES (v_class_id, v_user_id, 'active')
  ON CONFLICT (class_id, student_id) DO UPDATE SET status = 'active';

  RETURN v_class_id;
END;
$$;
